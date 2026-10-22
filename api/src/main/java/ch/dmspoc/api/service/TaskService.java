package ch.dmspoc.api.service;

import ch.dmspoc.api.dto.AssigneeDto;
import ch.dmspoc.api.dto.CreateTaskRequest;
import ch.dmspoc.api.dto.TaskDto;
import ch.dmspoc.api.dto.TaskMessageDto;
import ch.dmspoc.api.dto.TaskNotificationDto;
import ch.dmspoc.api.exception.AlfrescoApiException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Daily task list on top of Alfresco's embedded Activiti, using the stock "Assign a task"
 * (activitiAdhoc) process: one process per task, its "Adhoc Task" is the work item.
 *
 * <p>Documents are read with the logged-in user's ticket (Alfresco ACLs decide whether an attachment
 * opens); the workflow engine itself is driven by the service account.
 *
 * <p>Every workflow call runs as the shared service account, so Alfresco believes the initiator
 * of every process is that account. The real creator is therefore kept in a process variable
 * ({@code zapisCreator}) and the API enforces who may see or change what. When the assignee
 * completes the work item, Adhoc leaves a "Verify Adhoc Task Completed" task open for the initiator;
 * that task is the creator's durable notification, and dismissing it completes it (ending the process).
 *
 * <p>Custom variables must not contain an underscore-prefix that is not a registered content-model
 * prefix (a name like {@code zapis_creator} makes Alfresco fail when listing variables), hence the camelCase names.
 */
@Service
public class TaskService {

    private static final String PROCESS_KEY = "activitiAdhoc";
    private static final String ACTIVITY_WORK = "adhocTask";
    private static final String ACTIVITY_DONE_NOTICE = "verifyTaskDone";

    private static final String VAR_CREATOR = "zapisCreator";
    private static final String VAR_DESCRIPTION = "zapisDescription";
    private static final String VAR_MESSAGE = "zapisMessage";
    private static final String VAR_SITE = "zapisSiteId";
    /** Set to "true" when the assignee closed the task as cancelled instead of done. */
    private static final String VAR_CANCELLED = "zapisCancelled";

    private static final Map<String, String> STATUS_TO_ALFRESCO = Map.of(
            "new", "Not Yet Started",
            "in_progress", "In Progress",
            "on_hold", "On Hold");

    private static final DateTimeFormatter ALFRESCO_DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSZ");

    /** Workflow engine and people lookups: service account. */
    private final AlfrescoClient client;
    /** Document reads: the logged-in user, so Alfresco's ACLs decide who may open an attachment. */
    private final AlfrescoClient userClient;
    private final SpaceService spaces;
    private final TaskMessageStore messages;
    private final NotificationHub hub;
    /** Shared by all list requests, so a busy page cannot flood Alfresco with parallel calls. */
    private static final ExecutorService LIST_POOL = Executors.newFixedThreadPool(8, r -> {
        Thread t = new Thread(r, "task-list");
        t.setDaemon(true);
        return t;
    });

    public TaskService(@Qualifier("serviceAlfrescoClient") AlfrescoClient client, AlfrescoClient userClient, SpaceService spaces,
                       TaskMessageStore messages, NotificationHub hub) {
        this.client = client;
        this.userClient = userClient;
        this.spaces = spaces;
        this.messages = messages;
        this.hub = hub;
    }

    /** Site titles, fetched at most once per request and only if a task needs one. */
    private final class Titles {
        private Map<String, String> titles;

        synchronized String of(String siteId) {
            if (siteId == null) return null;
            if (titles == null) titles = spaces.titles();
            return titles.getOrDefault(siteId, siteId);
        }
    }

    // ---------------------------------------------------------------- queries

    /**
     * Tasks assigned to ({@code created == false}) or created by the user, newest first. Rows only need counts, so
     * attachment names and the per-document access check are left to {@link #get} (the opened task).
     */
    public List<TaskDto> list(String user, boolean created) {
        String where = created
                ? "(status='any' AND variables/" + VAR_CREATOR + " = 'd_text " + safe(user) + "')"
                : "(status='any' AND assignee='" + safe(user) + "')";
        Titles titles = new Titles();
        // Each task costs a few Alfresco round trips, so they run side by side instead of one after another.
        List<CompletableFuture<TaskDto>> pending = new ArrayList<>();
        for (JsonNode item : client.listTasks(where).path("list").path("entries")) {
            JsonNode task = item.path("entry");
            if (!ACTIVITY_WORK.equals(task.path("activityDefinitionId").asText())) continue;
            pending.add(CompletableFuture.supplyAsync(() -> toDto(task, titles, user, false), LIST_POOL));
        }
        List<TaskDto> result = new ArrayList<>();
        try {
            for (CompletableFuture<TaskDto> f : pending) {
                TaskDto dto = f.join();
                if (dto != null) result.add(dto);
            }
        } catch (CompletionException e) {
            if (e.getCause() instanceof RuntimeException re) throw re;
            throw e;
        }
        result.sort(Comparator.comparing(TaskDto::createdAt).reversed());
        return result;
    }

    public TaskDto get(String id, String user) {
        TaskDto task = load(id, user);
        if (!user.equals(task.creator()) && !user.equals(task.assignee())) {
            throw new AlfrescoApiException(403, "Not your task");
        }
        return task;
    }

    // ----------------------------------------------------------- conversation

    /**
     * The conversation on a task, oldest first; opening it marks it read for the caller. A note left before
     * conversations existed ({@code zapisMessage}) comes first, attributed to the assignee who wrote it.
     */
    public List<TaskMessageDto> messages(String id, String user) {
        Map<String, JsonNode> vars = participantVariables(id, user);
        List<TaskMessageDto> result = new ArrayList<>();
        String legacy = text(vars, VAR_MESSAGE);
        if (legacy != null && !legacy.isBlank()) {
            JsonNode work = findWorkItem(id);
            String createdAt = work == null ? null : isoDate(work.path("startedAt").asText(null));
            result.add(new TaskMessageDto("legacy", text(vars, "bpm_assignee"), legacy, createdAt));
        }
        TaskMessageStore.Thread thread = messages.thread(id);
        for (TaskMessageStore.Message m : thread.messages()) {
            result.add(new TaskMessageDto(m.id(), m.author(), m.text(), m.createdAt()));
        }
        messages.markRead(id, user, thread);
        return result;
    }

    /**
     * Process variables of task {@code id} once the user is checked to be its creator or assignee. Enough for the
     * conversation, which needs none of the attachment, status or space lookups a full {@link TaskDto} costs.
     */
    private Map<String, JsonNode> participantVariables(String id, String user) {
        Map<String, JsonNode> vars = processVariables(id);
        if (text(vars, VAR_CREATOR) == null) throw new AlfrescoApiException(404, "Task not found");
        if (!user.equals(text(vars, VAR_CREATOR)) && !user.equals(text(vars, "bpm_assignee"))) {
            throw new AlfrescoApiException(403, "Not your task");
        }
        return vars;
    }

    /** Either party may write while the task is open; a finished or cancelled task keeps its conversation read-only. */
    public TaskMessageDto postMessage(String id, String user, String text) {
        Map<String, JsonNode> vars = participantVariables(id, user);
        JsonNode work = findWorkItem(id);
        if (work == null) throw new AlfrescoApiException(404, "Task not found");
        if ("completed".equals(work.path("state").asText())) throw new AlfrescoApiException(409, "The task is already done");
        TaskMessageStore.Message m = messages.append(id, user, text);
        pushToOther("task-message", id, user, text(vars, "bpm_workflowDescription"), text(vars, VAR_CREATOR), text(vars, "bpm_assignee"));
        return new TaskMessageDto(m.id(), m.author(), m.text(), m.createdAt());
    }

    public List<AssigneeDto> assignees() {
        List<AssigneeDto> users = new ArrayList<>();
        for (JsonNode item : client.listPeople().path("list").path("entries")) {
            JsonNode p = item.path("entry");
            String id = p.path("id").asText();
            if (id.equals("guest") || !p.path("enabled").asBoolean(true)) continue;
            String name = (p.path("firstName").asText("") + " " + p.path("lastName").asText("")).trim();
            users.add(new AssigneeDto(id, name.isEmpty() ? id : name));
        }
        return users;
    }

    // --------------------------------------------------------------- commands

    public TaskDto create(CreateTaskRequest req, String username) {
        String title = req.title().trim();
        String assignee = req.assignee().trim();
        assertAssignable(assignee);
        List<String> attachmentIds = req.attachmentIds() == null ? List.of() : req.attachmentIds();
        String siteId = req.siteId() == null || req.siteId().isBlank() ? null : req.siteId().trim();
        if (siteId != null && !siteId.matches("[a-zA-Z0-9-]+")) throw new AlfrescoApiException(400, "Invalid siteId");
        for (String nodeId : attachmentIds) {
            String attachmentSite = assertAttachable(nodeId);
            if (siteId == null) siteId = attachmentSite;
        }

        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("bpm_assignee", assignee);
        vars.put("bpm_workflowDescription", title);
        vars.put("bpm_description", title);
        vars.put("bpm_sendEMailNotifications", false);
        String due = parseDueDate(req.dueDate());
        if (due != null) vars.put("bpm_workflowDueDate", due);

        String processId = client.startProcess(PROCESS_KEY, vars).path("entry").path("id").asText();
        try {
            client.setProcessVariable(processId, VAR_CREATOR, "d:text", username);
            if (siteId != null) client.setProcessVariable(processId, VAR_SITE, "d:text", siteId);
            if (req.description() != null && !req.description().isBlank()) {
                client.setProcessVariable(processId, VAR_DESCRIPTION, "d:text", req.description().trim());
            }
            if (!attachmentIds.isEmpty()) client.addProcessItems(processId, attachmentIds);
        } catch (RuntimeException e) {
            try {
                client.deleteProcess(processId);
            } catch (RuntimeException ignored) {
                // best effort; the original error is the useful one
            }
            throw e;
        }
        if (!assignee.equals(username)) {
            hub.publish(assignee, new NotificationHub.Event("task-assigned", processId, title, username));
        }
        return load(processId, username);
    }

    public TaskDto update(String id, String user, String status, String message) {
        // Cancelling closes the task, exactly like resolving it.
        if ("cancelled".equals(status)) return resolve(id, user, message, true);
        String taskId = workItemId(id, user);
        if (status != null) {
            String alfrescoStatus = STATUS_TO_ALFRESCO.get(status);
            if (alfrescoStatus == null) {
                throw new AlfrescoApiException(400, "status must be one of new, in_progress, on_hold, cancelled (use resolve to finish a task)");
            }
            client.setTaskVariable(taskId, "bpm_status", "d:text", alfrescoStatus, "local");
        }
        if (message != null && !message.isBlank()) messages.append(id, user, message);
        TaskDto updated = load(id, user);
        pushToOther("task-updated", id, user, updated.title(), updated.creator(), updated.assignee());
        return updated;
    }

    public TaskDto resolve(String id, String user, String message, boolean cancelled) {
        if (cancelled && (message == null || message.isBlank())) {
            throw new AlfrescoApiException(400, "A reason is required to cancel a task");
        }
        String taskId = workItemId(id, user);
        if (message != null && !message.isBlank()) {
            messages.append(id, user, cancelled ? "Cancelation information: " + message.trim() : message);
        }
        if (cancelled) client.setProcessVariable(id, VAR_CANCELLED, "d:text", "true");
        client.setTaskVariable(taskId, "bpm_status", "d:text", "Completed", "local");
        client.setTaskState(taskId, "completed");
        TaskDto done = load(id, user);
        pushToOther(cancelled ? "task-updated" : "task-completed", id, user, done.title(), done.creator(), done.assignee());
        return done;
    }

    // ---------------------------------------------------------- notifications

    /** Open "task done" notices for tasks the user created. */
    public List<TaskNotificationDto> notifications(String user) {
        String where = "(status='active' AND variables/" + VAR_CREATOR + " = 'd_text " + safe(user) + "')";
        List<TaskNotificationDto> result = new ArrayList<>();
        for (JsonNode item : client.listTasks(where).path("list").path("entries")) {
            JsonNode notice = item.path("entry");
            if (!ACTIVITY_DONE_NOTICE.equals(notice.path("activityDefinitionId").asText())) continue;
            String processId = notice.path("processId").asText();
            Map<String, JsonNode> vars = processVariables(processId);
            result.add(new TaskNotificationDto(notice.path("id").asText(), processId, notice.path("description").asText(""),
                    text(vars, "bpm_assignee"), isoDate(notice.path("startedAt").asText(null))));
        }
        result.sort(Comparator.comparing(TaskNotificationDto::resolvedAt).reversed());
        return result;
    }

    public void dismissNotification(String noticeId, String user) {
        JsonNode notice = client.getTask(noticeId).path("entry");
        boolean mine = ACTIVITY_DONE_NOTICE.equals(notice.path("activityDefinitionId").asText())
                && !"completed".equals(notice.path("state").asText())
                && user.equals(text(processVariables(notice.path("processId").asText()), VAR_CREATOR));
        if (!mine) throw new AlfrescoApiException(404, "Notification not found");
        client.setTaskState(noticeId, "completed");
    }

    // ---------------------------------------------------------------- helpers

    /** Tells the other party of the task (creator or assignee) that {@code actor} did something to it. */
    private void pushToOther(String type, String taskId, String actor, String title, String creator, String assignee) {
        String other = actor.equals(creator) ? assignee : creator;
        if (other == null || other.equals(actor)) return;
        hub.publish(other, new NotificationHub.Event(type, taskId, title, actor));
    }

    /** The task as a DTO; 404 if the process doesn't exist or isn't one of ours. */
    private TaskDto load(String processId, String viewer) {
        JsonNode work = findWorkItem(processId);
        TaskDto dto = work == null ? null : toDto(work, new Titles(), viewer, true);
        if (dto == null) throw new AlfrescoApiException(404, "Task not found");
        return dto;
    }

    /**
     * The work item of a process, open or completed. {@code GET /processes/{id}/tasks} only lists
     * active tasks, so a resolved task would vanish; {@code status='any'} on /tasks keeps it reachable.
     */
    private JsonNode findWorkItem(String processId) {
        String where = "(status='any' AND processId='" + safe(processId) + "')";
        for (JsonNode item : client.listTasks(where).path("list").path("entries")) {
            JsonNode entry = item.path("entry");
            if (ACTIVITY_WORK.equals(entry.path("activityDefinitionId").asText())) return entry;
        }
        return null;
    }

    /** Id of the open work item of task {@code id}; only its assignee may act on it. */
    private String workItemId(String id, String user) {
        TaskDto task = load(id, user);
        if (!user.equals(task.assignee())) throw new AlfrescoApiException(403, "Only the assignee can do this");
        if (task.resolved()) throw new AlfrescoApiException(409, "The task is already done");
        JsonNode work = findWorkItem(id);
        if (work == null) throw new AlfrescoApiException(404, "Task not found");
        return work.path("id").asText();
    }

    /** Null when the work item belongs to a process this feature didn't start. */
    private TaskDto toDto(JsonNode task, Titles titles, String viewer, boolean checkAccess) {
        String processId = task.path("processId").asText();
        Map<String, JsonNode> vars = processVariables(processId);
        String creator = text(vars, VAR_CREATOR);
        if (creator == null) return null;

        boolean done = "completed".equals(task.path("state").asText());
        String status = !done ? statusOf(task.path("id").asText())
                : "true".equals(text(vars, VAR_CANCELLED)) ? "cancelled" : "done";
        List<TaskDto.Attachment> attachments = new ArrayList<>();
        for (JsonNode item : client.listProcessItems(processId).path("list").path("entries")) {
            String itemId = item.path("entry").path("id").asText();
            if (!checkAccess) {
                attachments.add(new TaskDto.Attachment(itemId, "", true));
                continue;
            }
            // Alfresco's ACLs decide: a user outside the document's space neither opens it nor learns its name.
            boolean accessible = canRead(itemId);
            attachments.add(new TaskDto.Attachment(itemId, accessible ? item.path("entry").path("name").asText() : "", accessible));
        }
        String title = text(vars, "bpm_workflowDescription");
        String siteId = text(vars, VAR_SITE);
        TaskMessageStore.Summary convo = messages.summary(processId, viewer);
        // A note from before conversations is shown as the first message, so it counts as one.
        boolean legacyNote = text(vars, VAR_MESSAGE) != null && !text(vars, VAR_MESSAGE).isBlank();
        return new TaskDto(processId, title != null ? title : task.path("description").asText(""),
                text(vars, VAR_DESCRIPTION), isoDate(task.path("startedAt").asText(null)), isoDate(task.path("dueAt").asText(null)),
                creator, text(vars, "bpm_assignee"), status, text(vars, VAR_MESSAGE), attachments, done,
                siteId, titles.of(siteId),
                convo.unread(), convo.count() + (legacyNote ? 1 : 0));
    }

    /** Whether the logged-in user may read the node (ticket call: Alfresco answers 403/404 otherwise). */
    private boolean canRead(String nodeId) {
        try {
            userClient.getNode(nodeId, null);
            return true;
        } catch (AlfrescoApiException e) {
            if (e.getStatus() == 403 || e.getStatus() == 404) return false;
            throw e;
        }
    }

    private String statusOf(String taskId) {
        for (JsonNode v : client.listTaskVariables(taskId, "local").path("list").path("entries")) {
            if ("bpm_status".equals(v.path("entry").path("name").asText())) {
                return switch (v.path("entry").path("value").asText()) {
                    case "In Progress" -> "in_progress";
                    case "On Hold" -> "on_hold";                    case "Completed" -> "done";
                    default -> "new";
                };
            }
        }
        return "new";
    }

    private Map<String, JsonNode> processVariables(String processId) {
        Map<String, JsonNode> vars = new HashMap<>();
        for (JsonNode v : client.listProcessVariables(processId).path("list").path("entries")) {
            vars.put(v.path("entry").path("name").asText(), v.path("entry").path("value"));
        }
        return vars;
    }

    private static String text(Map<String, JsonNode> vars, String name) {
        JsonNode v = vars.get(name);
        return v == null || v.isNull() || v.isMissingNode() || v.asText().isEmpty() ? null : v.asText();
    }

    private void assertAssignable(String username) {
        safe(username);
        try {
            if (!client.getPerson(username).path("entry").path("enabled").asBoolean(true)) {
                throw new AlfrescoApiException(400, "User is disabled: " + username);
            }
        } catch (AlfrescoApiException e) {
            if (e.getStatus() == 404) throw new AlfrescoApiException(400, "Unknown assignee: " + username);
            throw e;
        }
    }

    /**
     * Attachments must be files the creator can read (checked with their own ticket, so Alfresco's ACLs
     * apply). Returns the id of the space (Share site) the file lives in, or null if it is not in one.
     */
    private String assertAttachable(String nodeId) {
        JsonNode node;
        try {
            node = userClient.getNode(nodeId, "path").path("entry");
        } catch (AlfrescoApiException e) {
            if (e.getStatus() == 403) throw new AlfrescoApiException(403, "No access to attachment: " + nodeId);
            if (e.getStatus() == 404 || e.getStatus() == 400) throw new AlfrescoApiException(400, "Attachment not found: " + nodeId);
            throw e;
        }
        if (!node.path("isFile").asBoolean(false)) throw new AlfrescoApiException(400, "Only documents can be attached: " + nodeId);
        return siteOf(node);
    }

    /** The site id in a node's path ({@code /Company Home/Sites/<site>/documentLibrary/...}), or null. */
    private static String siteOf(JsonNode node) {
        JsonNode elements = node.path("path").path("elements");
        for (int i = 0; i < elements.size() - 1; i++) {
            if ("Sites".equals(elements.get(i).path("name").asText())) return elements.get(i + 1).path("name").asText(null);
        }
        return null;
    }

    /** Alfresco date-time for a yyyy-MM-dd date (midnight UTC) or an ISO offset date-time; null when blank. */
    private static String parseDueDate(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            OffsetDateTime dt = value.contains("T")
                    ? OffsetDateTime.parse(value.trim())
                    : LocalDate.parse(value.trim()).atStartOfDay().atOffset(ZoneOffset.UTC);
            return dt.format(ALFRESCO_DATE);
        } catch (DateTimeParseException e) {
            throw new AlfrescoApiException(400, "dueDate must be yyyy-MM-dd or an ISO date-time");
        }
    }

    /** Alfresco's "+0000" offsets don't parse in every browser; return ISO-8601 (date-only for midnight UTC). */
    private static String isoDate(String alfrescoDate) {
        if (alfrescoDate == null || alfrescoDate.isEmpty()) return null;
        OffsetDateTime dt = OffsetDateTime.parse(alfrescoDate, ALFRESCO_DATE).withOffsetSameInstant(ZoneOffset.UTC);
        return dt.toLocalTime().toSecondOfDay() == 0 && dt.getNano() == 0 ? dt.toLocalDate().toString() : dt.toString();
    }

    /** Usernames are interpolated into workflow "where" queries, so reject anything that could break out of the quotes. */
    private static String safe(String username) {
        if (username == null || username.contains("'") || username.contains("\\")) {
            throw new AlfrescoApiException(400, "Invalid username");
        }
        return username;
    }
}
