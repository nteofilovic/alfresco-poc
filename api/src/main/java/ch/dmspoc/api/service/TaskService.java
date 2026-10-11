package ch.dmspoc.api.service;

import ch.dmspoc.api.dto.AssigneeDto;
import ch.dmspoc.api.dto.CreateTaskRequest;
import ch.dmspoc.api.dto.TaskDto;
import ch.dmspoc.api.dto.TaskNotificationDto;
import ch.dmspoc.api.exception.AlfrescoApiException;
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

/**
 * Daily task list on top of Alfresco's embedded Activiti, using the stock "Assign a task"
 * (activitiAdhoc) process: one process per task, its "Adhoc Task" is the work item.
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

    private static final Map<String, String> STATUS_TO_ALFRESCO = Map.of(
            "new", "Not Yet Started",
            "in_progress", "In Progress",
            "on_hold", "On Hold");

    private static final DateTimeFormatter ALFRESCO_DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSZ");

    private final AlfrescoClient client;
    private final WorkspaceService workspace;

    public TaskService(AlfrescoClient client, WorkspaceService workspace) {
        this.client = client;
        this.workspace = workspace;
    }

    // ---------------------------------------------------------------- queries

    /** Tasks assigned to ({@code created == false}) or created by the user, newest first. */
    public List<TaskDto> list(String user, boolean created) {
        String where = created
                ? "(status='any' AND variables/" + VAR_CREATOR + " = 'd_text " + safe(user) + "')"
                : "(status='any' AND assignee='" + safe(user) + "')";
        List<TaskDto> result = new ArrayList<>();
        for (JsonNode item : client.listTasks(where).path("list").path("entries")) {
            JsonNode task = item.path("entry");
            if (!ACTIVITY_WORK.equals(task.path("activityDefinitionId").asText())) continue;
            TaskDto dto = toDto(task);
            if (dto != null) result.add(dto);
        }
        result.sort(Comparator.comparing(TaskDto::createdAt).reversed());
        return result;
    }

    public TaskDto get(String id, String user) {
        TaskDto task = load(id);
        if (!user.equals(task.creator()) && !user.equals(task.assignee())) {
            throw new AlfrescoApiException(403, "Not your task");
        }
        return task;
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

    public TaskDto create(CreateTaskRequest req, String user, boolean isAdmin) {
        String title = req.title().trim();
        String assignee = req.assignee().trim();
        assertAssignable(assignee);
        List<String> attachmentIds = req.attachmentIds() == null ? List.of() : req.attachmentIds();
        for (String nodeId : attachmentIds) assertAttachable(nodeId, isAdmin);

        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("bpm_assignee", assignee);
        vars.put("bpm_workflowDescription", title);
        vars.put("bpm_description", title);
        vars.put("bpm_sendEMailNotifications", false);
        String due = parseDueDate(req.dueDate());
        if (due != null) vars.put("bpm_workflowDueDate", due);

        String processId = client.startProcess(PROCESS_KEY, vars).path("entry").path("id").asText();
        try {
            client.setProcessVariable(processId, VAR_CREATOR, "d:text", user);
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
        return load(processId);
    }

    public TaskDto update(String id, String user, String status, String message) {
        String taskId = workItemId(id, user);
        if (status != null) {
            String alfrescoStatus = STATUS_TO_ALFRESCO.get(status);
            if (alfrescoStatus == null) {
                throw new AlfrescoApiException(400, "status must be one of new, in_progress, on_hold (use resolve to finish a task)");
            }
            client.setTaskVariable(taskId, "bpm_status", "d:text", alfrescoStatus, "local");
        }
        if (message != null) client.setProcessVariable(id, VAR_MESSAGE, "d:text", message.trim());
        return load(id);
    }

    public TaskDto resolve(String id, String user, String message) {
        String taskId = workItemId(id, user);
        if (message != null) client.setProcessVariable(id, VAR_MESSAGE, "d:text", message.trim());
        client.setTaskVariable(taskId, "bpm_status", "d:text", "Completed", "local");
        client.setTaskState(taskId, "completed");
        return load(id);
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

    /** The task as a DTO; 404 if the process doesn't exist or isn't one of ours. */
    private TaskDto load(String processId) {
        JsonNode work = findWorkItem(processId);
        TaskDto dto = work == null ? null : toDto(work);
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
        TaskDto task = load(id);
        if (!user.equals(task.assignee())) throw new AlfrescoApiException(403, "Only the assignee can do this");
        if (task.resolved()) throw new AlfrescoApiException(409, "The task is already done");
        JsonNode work = findWorkItem(id);
        if (work == null) throw new AlfrescoApiException(404, "Task not found");
        return work.path("id").asText();
    }

    /** Null when the work item belongs to a process this feature didn't start. */
    private TaskDto toDto(JsonNode task) {
        String processId = task.path("processId").asText();
        Map<String, JsonNode> vars = processVariables(processId);
        String creator = text(vars, VAR_CREATOR);
        if (creator == null) return null;

        boolean done = "completed".equals(task.path("state").asText());
        String status = done ? "done" : statusOf(task.path("id").asText());
        List<TaskDto.Attachment> attachments = new ArrayList<>();
        for (JsonNode item : client.listProcessItems(processId).path("list").path("entries")) {
            attachments.add(new TaskDto.Attachment(item.path("entry").path("id").asText(), item.path("entry").path("name").asText()));
        }
        String title = text(vars, "bpm_workflowDescription");
        return new TaskDto(processId, title != null ? title : task.path("description").asText(""),
                text(vars, VAR_DESCRIPTION), isoDate(task.path("startedAt").asText(null)), isoDate(task.path("dueAt").asText(null)),
                creator, text(vars, "bpm_assignee"), status, text(vars, VAR_MESSAGE), attachments, done);
    }

    private String statusOf(String taskId) {
        for (JsonNode v : client.listTaskVariables(taskId, "local").path("list").path("entries")) {
            if ("bpm_status".equals(v.path("entry").path("name").asText())) {
                return switch (v.path("entry").path("value").asText()) {
                    case "In Progress" -> "in_progress";
                    case "On Hold" -> "on_hold";
                    case "Completed" -> "done";
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

    /** Attachments must be files; non-admins may only attach files from inside the workspace. */
    private void assertAttachable(String nodeId, boolean isAdmin) {
        JsonNode node;
        if (isAdmin) {
            try {
                node = client.getNode(nodeId, null).path("entry");
            } catch (AlfrescoApiException e) {
                throw new AlfrescoApiException(400, "Attachment not found: " + nodeId);
            }
        } else {
            node = workspace.findInWorkspace(nodeId)
                    .orElseThrow(() -> new AlfrescoApiException(403, "Attachment is outside the workspace: " + nodeId));
        }
        if (!node.path("isFile").asBoolean(false)) throw new AlfrescoApiException(400, "Only documents can be attached: " + nodeId);
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
