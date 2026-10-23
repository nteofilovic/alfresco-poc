package ch.dmspoc.api.service;

import ch.dmspoc.api.dto.AssigneeDto;
import ch.dmspoc.api.dto.CreateTaskRequest;
import ch.dmspoc.api.dto.TaskDto;
import ch.dmspoc.api.dto.TaskMessageDto;
import ch.dmspoc.api.dto.TaskNotificationDto;
import ch.dmspoc.api.exception.AlfrescoApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** The task rules (who may see and change what, what notifies whom); Alfresco, the store and the hub are mocked. */
class TaskServiceTest {

    private static final String STARTED = "2026-10-01T09:30:00.000+0000";

    private final ObjectMapper mapper = JsonMapper.builder().build();
    private AlfrescoClient client;
    private AlfrescoClient userClient;
    private SpaceService spaces;
    private TaskMessageStore messages;
    private NotificationHub hub;
    private TaskService tasks;

    @BeforeEach
    void setUp() {
        client = mock(AlfrescoClient.class);
        userClient = mock(AlfrescoClient.class);
        spaces = mock(SpaceService.class);
        messages = mock(TaskMessageStore.class);
        hub = mock(NotificationHub.class);
        tasks = new TaskService(client, userClient, spaces, messages, hub);

        when(messages.summary(anyString(), anyString())).thenReturn(new TaskMessageStore.Summary(0, 0));
        when(messages.thread(anyString())).thenReturn(new TaskMessageStore.Thread(List.of(), Map.of()));
        when(client.listProcessItems(anyString())).thenReturn(list());
        when(client.listTaskVariables(anyString(), eq("local"))).thenReturn(list());
    }

    // ------------------------------------------------------------------- list

    @Test
    void assignedTasksAreQueriedByAssignee() {
        when(client.listTasks("(status='any' AND assignee='anna')")).thenReturn(list());

        assertTrue(tasks.list("anna", false).isEmpty());
        verify(client).listTasks("(status='any' AND assignee='anna')");
    }

    @Test
    void createdTasksAreQueriedByTheCreatorVariable() {
        when(client.listTasks("(status='any' AND variables/zapisCreator = 'd_text anna')")).thenReturn(list());

        assertTrue(tasks.list("anna", true).isEmpty());
        verify(client).listTasks("(status='any' AND variables/zapisCreator = 'd_text anna')");
    }

    @Test
    void usernamesThatCouldBreakTheQueryAreRefused() {
        for (String bad : List.of("o'brien", "back\\slash", "x' OR '1'='1")) {
            assertEquals(400, assertThrows(AlfrescoApiException.class, () -> tasks.list(bad, false)).getStatus(), bad);
            assertEquals(400, assertThrows(AlfrescoApiException.class, () -> tasks.list(bad, true)).getStatus(), bad);
        }
        verifyNoInteractions(client);
    }

    @Test
    void onlyWorkItemsOfOurOwnProcessesAreListed() {
        when(client.listTasks(anyString())).thenReturn(list(
                task("p1", "t1", "adhocTask", "unclaimed"),
                task("p1", "t1b", "verifyTaskDone", "unclaimed"),
                task("p2", "t2", "adhocTask", "unclaimed"),
                task("p3", "t3", "otherActivity", "unclaimed")));
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna", "bpm_workflowDescription", "First");
        variables("p2", "bpm_assignee", "anna"); // started by someone else: no creator variable
        variables("p3", "zapisCreator", "ben");

        List<TaskDto> result = tasks.list("anna", false);

        assertEquals(List.of("p1"), result.stream().map(TaskDto::id).toList());
    }

    @Test
    void newestTasksComeFirst() {
        when(client.listTasks(anyString())).thenReturn(list(
                task("p1", "t1", "adhocTask", "unclaimed", "2026-10-01T09:30:00.000+0000", null),
                task("p2", "t2", "adhocTask", "unclaimed", "2026-10-03T09:30:00.000+0000", null),
                task("p3", "t3", "adhocTask", "unclaimed", "2026-10-02T09:30:00.000+0000", null)));
        for (String p : List.of("p1", "p2", "p3")) variables(p, "zapisCreator", "ben", "bpm_assignee", "anna");

        assertEquals(List.of("p2", "p3", "p1"), tasks.list("anna", false).stream().map(TaskDto::id).toList());
    }

    @Test
    void listRowsSkipTheAttachmentAccessCheck() {
        when(client.listTasks(anyString())).thenReturn(list(task("p1", "t1", "adhocTask", "unclaimed")));
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna");
        when(client.listProcessItems("p1")).thenReturn(list(item("doc1", "Secret.pdf")));

        TaskDto row = tasks.list("anna", false).getFirst();

        assertEquals(List.of(new TaskDto.Attachment("doc1", "", true)), row.attachments());
        verifyNoInteractions(userClient);
    }

    @Test
    void aFailureWhileLoadingATaskIsPassedOnUnchanged() {
        when(client.listTasks(anyString())).thenReturn(list(task("p1", "t1", "adhocTask", "unclaimed")));
        when(client.listProcessVariables("p1")).thenThrow(new AlfrescoApiException(500, "boom"));

        assertEquals(500, assertThrows(AlfrescoApiException.class, () -> tasks.list("anna", false)).getStatus());
    }

    @Test
    void anEmptyTaskListIsEmpty() {
        when(client.listTasks(anyString())).thenReturn(list());

        assertTrue(tasks.list("anna", false).isEmpty());
    }

    // ----------------------------------------------------------------- mapping

    @Test
    void aTaskIsMappedFromTheWorkItemAndItsVariables() {
        open("p1", "t1", "ben", "anna");
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna", "bpm_workflowDescription", "Review contract",
                "zapisDescription", "Please check clause 4", "zapisSiteId", "clients");
        when(spaces.titles()).thenReturn(Map.of("clients", "Clients"));
        when(messages.summary("p1", "anna")).thenReturn(new TaskMessageStore.Summary(2, 5));

        TaskDto task = tasks.get("p1", "anna");

        assertEquals("p1", task.id());
        assertEquals("Review contract", task.title());
        assertEquals("Please check clause 4", task.description());
        assertEquals("ben", task.creator());
        assertEquals("anna", task.assignee());
        assertEquals("2026-10-01T09:30Z", task.createdAt());
        assertEquals("clients", task.siteId());
        assertEquals("Clients", task.siteTitle());
        assertEquals(2, task.unreadMessages());
        assertEquals(5, task.messageCount());
        assertFalse(task.resolved());
        assertEquals("new", task.status());
    }

    @Test
    void midnightDatesAreShownWithoutATime() {
        when(client.listTasks(workQuery("p1"))).thenReturn(list(task("p1", "t1", "adhocTask", "unclaimed", STARTED, "2026-10-05T00:00:00.000+0000")));
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna");

        assertEquals("2026-10-05", tasks.get("p1", "anna").dueDate());
    }

    @Test
    void aMissingDueDateStaysNull() {
        open("p1", "t1", "ben", "anna");

        assertNull(tasks.get("p1", "anna").dueDate());
    }

    @Test
    void datesInOtherOffsetsAreConvertedToUtc() {
        when(client.listTasks(workQuery("p1"))).thenReturn(list(task("p1", "t1", "adhocTask", "unclaimed", "2026-10-01T11:30:00.000+0200", null)));
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna");

        assertEquals("2026-10-01T09:30Z", tasks.get("p1", "anna").createdAt());
    }

    @Test
    void theTitleFallsBackToTheWorkItemDescription() {
        open("p1", "t1", "ben", "anna");

        assertEquals("desc p1", tasks.get("p1", "anna").title());
    }

    @Test
    void aSpaceWithoutAKnownTitleShowsItsId() {
        open("p1", "t1", "ben", "anna");
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna", "zapisSiteId", "retired");
        when(spaces.titles()).thenReturn(Map.of());

        assertEquals("retired", tasks.get("p1", "anna").siteTitle());
    }

    @Test
    void siteTitlesAreNotFetchedForTasksWithoutASpace() {
        open("p1", "t1", "ben", "anna");

        TaskDto task = tasks.get("p1", "anna");

        assertNull(task.siteId());
        assertNull(task.siteTitle());
        verify(spaces, never()).titles();
    }

    @Test
    void theSiteTitlesAreFetchedOnceForAWholeList() {
        when(client.listTasks(anyString())).thenReturn(list(
                task("p1", "t1", "adhocTask", "unclaimed"), task("p2", "t2", "adhocTask", "unclaimed"),
                task("p3", "t3", "adhocTask", "unclaimed")));
        for (String p : List.of("p1", "p2", "p3")) variables(p, "zapisCreator", "ben", "bpm_assignee", "anna", "zapisSiteId", "clients");
        when(spaces.titles()).thenReturn(Map.of("clients", "Clients"));

        tasks.list("anna", false);

        verify(spaces, times(1)).titles();
    }

    @Test
    void aNoteFromBeforeConversationsCountsAsAMessage() {
        open("p1", "t1", "ben", "anna");
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna", "zapisMessage", "old note");
        when(messages.summary("p1", "anna")).thenReturn(new TaskMessageStore.Summary(0, 2));

        TaskDto task = tasks.get("p1", "anna");

        assertEquals(3, task.messageCount());
        assertEquals("old note", task.message());
    }

    @Test
    void aBlankLegacyNoteDoesNotCount() {
        open("p1", "t1", "ben", "anna");
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna", "zapisMessage", "   ");

        assertEquals(0, tasks.get("p1", "anna").messageCount());
    }

    @Test
    void theStatusOfAnOpenTaskComesFromItsLocalStatusVariable() {
        Map<String, String> expected = Map.of("In Progress", "in_progress", "On Hold", "on_hold", "Completed", "done",
                "Not Yet Started", "new", "Something Else", "new");
        for (var e : expected.entrySet()) {
            open("p1", "t1", "ben", "anna");
            when(client.listTaskVariables("t1", "local")).thenReturn(list(
                    "{\"entry\":{\"name\":\"bpm_other\",\"value\":\"x\"}}",
                    "{\"entry\":{\"name\":\"bpm_status\",\"value\":\"" + e.getKey() + "\"}}"));

            assertEquals(e.getValue(), tasks.get("p1", "anna").status(), e.getKey());
        }
    }

    @Test
    void aFinishedTaskIsDoneOrCancelled() {
        when(client.listTasks(workQuery("p1"))).thenReturn(list(task("p1", "t1", "adhocTask", "completed")));
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna");
        TaskDto done = tasks.get("p1", "anna");
        assertEquals("done", done.status());
        assertTrue(done.resolved());

        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna", "zapisCancelled", "true");
        assertEquals("cancelled", tasks.get("p1", "anna").status());

        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna", "zapisCancelled", "false");
        assertEquals("done", tasks.get("p1", "anna").status());
    }

    @Test
    void attachmentsAreCheckedAgainstTheViewersOwnRights() {
        open("p1", "t1", "ben", "anna");
        when(client.listProcessItems("p1")).thenReturn(list(item("ok", "Open.pdf"), item("forbidden", "Secret.pdf"),
                item("gone", "Deleted.pdf")));
        when(userClient.getNode("forbidden", null)).thenThrow(new AlfrescoApiException(403, "no"));
        when(userClient.getNode("gone", null)).thenThrow(new AlfrescoApiException(404, "no"));

        assertEquals(List.of(
                new TaskDto.Attachment("ok", "Open.pdf", true),
                new TaskDto.Attachment("forbidden", "", false),
                new TaskDto.Attachment("gone", "", false)), tasks.get("p1", "anna").attachments());
    }

    @Test
    void otherErrorsWhileCheckingAnAttachmentArePassedOn() {
        open("p1", "t1", "ben", "anna");
        when(client.listProcessItems("p1")).thenReturn(list(item("doc", "A.pdf")));
        when(userClient.getNode("doc", null)).thenThrow(new AlfrescoApiException(500, "boom"));

        assertEquals(500, assertThrows(AlfrescoApiException.class, () -> tasks.get("p1", "anna")).getStatus());
    }

    // --------------------------------------------------------------------- get

    @Test
    void bothPartiesMayOpenATaskButNobodyElse() {
        open("p1", "t1", "ben", "anna");

        assertEquals("p1", tasks.get("p1", "ben").id());
        assertEquals("p1", tasks.get("p1", "anna").id());
        assertEquals(403, assertThrows(AlfrescoApiException.class, () -> tasks.get("p1", "carl")).getStatus());
    }

    @Test
    void anUnknownTaskIsNotFound() {
        when(client.listTasks(workQuery("nope"))).thenReturn(list());

        assertEquals(404, assertThrows(AlfrescoApiException.class, () -> tasks.get("nope", "anna")).getStatus());
    }

    @Test
    void aProcessThatIsNotATaskOfOursIsNotFound() {
        when(client.listTasks(workQuery("p9"))).thenReturn(list(task("p9", "t9", "adhocTask", "unclaimed")));
        variables("p9", "bpm_assignee", "anna");

        assertEquals(404, assertThrows(AlfrescoApiException.class, () -> tasks.get("p9", "anna")).getStatus());
    }

    @Test
    void theProcessIdIsKeptOutOfTheQueryWhenItCouldBreakIt() {
        assertEquals(400, assertThrows(AlfrescoApiException.class, () -> tasks.get("p1' OR '1'='1", "anna")).getStatus());
    }

    // ------------------------------------------------------------ conversation

    @Test
    void theConversationIsReadAndMarkedReadForTheCaller() {
        open("p1", "t1", "ben", "anna");
        var thread = new TaskMessageStore.Thread(List.of(
                new TaskMessageStore.Message("m1", "ben", "hello", "2026-10-01T10:00:00Z"),
                new TaskMessageStore.Message("m2", "anna", "hi", "2026-10-01T10:05:00Z")), Map.of());
        when(messages.thread("p1")).thenReturn(thread);

        List<TaskMessageDto> result = tasks.messages("p1", "anna");

        assertEquals(List.of(new TaskMessageDto("m1", "ben", "hello", "2026-10-01T10:00:00Z"),
                new TaskMessageDto("m2", "anna", "hi", "2026-10-01T10:05:00Z")), result);
        verify(messages).markRead("p1", "anna", thread);
    }

    @Test
    void aLegacyNoteComesFirstAttributedToTheAssignee() {
        open("p1", "t1", "ben", "anna");
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna", "zapisMessage", "old note");
        when(messages.thread("p1")).thenReturn(new TaskMessageStore.Thread(List.of(
                new TaskMessageStore.Message("m1", "ben", "new", "2026-10-02T10:00:00Z")), Map.of()));

        List<TaskMessageDto> result = tasks.messages("p1", "ben");

        assertEquals(new TaskMessageDto("legacy", "anna", "old note", "2026-10-01T09:30Z"), result.get(0));
        assertEquals("m1", result.get(1).id());
    }

    @Test
    void aLegacyNoteWithoutAWorkItemHasNoDate() {
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna", "zapisMessage", "old note");
        when(client.listTasks(workQuery("p1"))).thenReturn(list());

        assertNull(tasks.messages("p1", "anna").getFirst().createdAt());
    }

    @Test
    void aBlankLegacyNoteIsNotShown() {
        open("p1", "t1", "ben", "anna");
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna", "zapisMessage", "  ");

        assertTrue(tasks.messages("p1", "anna").isEmpty());
    }

    @Test
    void strangersCannotReadTheConversation() {
        open("p1", "t1", "ben", "anna");

        assertEquals(403, assertThrows(AlfrescoApiException.class, () -> tasks.messages("p1", "carl")).getStatus());
        verify(messages, never()).markRead(anyString(), anyString(), any());
    }

    @Test
    void theConversationOfAnUnknownTaskIsNotFound() {
        when(client.listProcessVariables("nope")).thenReturn(list());

        assertEquals(404, assertThrows(AlfrescoApiException.class, () -> tasks.messages("nope", "anna")).getStatus());
    }

    @Test
    void postingAppendsAndNotifiesTheOtherParty() {
        open("p1", "t1", "ben", "anna");
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna", "bpm_workflowDescription", "Review");
        when(messages.append("p1", "anna", "done soon")).thenReturn(new TaskMessageStore.Message("m1", "anna", "done soon", "ts"));

        TaskMessageDto posted = tasks.postMessage("p1", "anna", "done soon");

        assertEquals(new TaskMessageDto("m1", "anna", "done soon", "ts"), posted);
        verify(hub).publish("ben", new NotificationHub.Event("task-message", "p1", "Review", "anna"));
    }

    @Test
    void theCreatorPostingNotifiesTheAssignee() {
        open("p1", "t1", "ben", "anna");
        when(messages.append(anyString(), anyString(), anyString())).thenReturn(new TaskMessageStore.Message("m", "ben", "x", "ts"));

        tasks.postMessage("p1", "ben", "x");

        verify(hub).publish(eq("anna"), any(NotificationHub.Event.class));
    }

    @Test
    void postingToYourOwnTaskNotifiesNobody() {
        open("p1", "t1", "anna", "anna");
        when(messages.append(anyString(), anyString(), anyString())).thenReturn(new TaskMessageStore.Message("m", "anna", "x", "ts"));

        tasks.postMessage("p1", "anna", "x");

        verifyNoInteractions(hub);
    }

    @Test
    void strangersCannotPost() {
        open("p1", "t1", "ben", "anna");

        assertEquals(403, assertThrows(AlfrescoApiException.class, () -> tasks.postMessage("p1", "carl", "x")).getStatus());
        verify(messages, never()).append(anyString(), anyString(), anyString());
    }

    @Test
    void aFinishedTaskKeepsItsConversationReadOnly() {
        when(client.listTasks(workQuery("p1"))).thenReturn(list(task("p1", "t1", "adhocTask", "completed")));
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna");

        assertEquals(409, assertThrows(AlfrescoApiException.class, () -> tasks.postMessage("p1", "anna", "x")).getStatus());
        verify(messages, never()).append(anyString(), anyString(), anyString());
    }

    @Test
    void postingWithoutAWorkItemIsNotFound() {
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna");
        when(client.listTasks(workQuery("p1"))).thenReturn(list());

        assertEquals(404, assertThrows(AlfrescoApiException.class, () -> tasks.postMessage("p1", "anna", "x")).getStatus());
    }

    @Test
    void aRefusedMessageSendsNoNotification() {
        open("p1", "t1", "ben", "anna");
        when(messages.append("p1", "anna", " ")).thenThrow(new AlfrescoApiException(400, "Message is empty"));

        assertEquals(400, assertThrows(AlfrescoApiException.class, () -> tasks.postMessage("p1", "anna", " ")).getStatus());
        verifyNoInteractions(hub);
    }

    // --------------------------------------------------------------- assignees

    @Test
    void assigneesSkipGuestAndDisabledAccounts() {
        when(client.listPeople()).thenReturn(list(
                "{\"entry\":{\"id\":\"anna\",\"firstName\":\"Anna\",\"lastName\":\"Meier\",\"enabled\":true}}",
                "{\"entry\":{\"id\":\"guest\",\"firstName\":\"Guest\",\"enabled\":true}}",
                "{\"entry\":{\"id\":\"old\",\"firstName\":\"Old\",\"enabled\":false}}",
                "{\"entry\":{\"id\":\"ben\",\"firstName\":\"Ben\"}}",
                "{\"entry\":{\"id\":\"nameless\",\"enabled\":true}}"));

        assertEquals(List.of(new AssigneeDto("anna", "Anna Meier"), new AssigneeDto("ben", "Ben"),
                new AssigneeDto("nameless", "nameless")), tasks.assignees());
    }

    @Test
    void noPeopleGivesNoAssignees() {
        when(client.listPeople()).thenReturn(list());

        assertTrue(tasks.assignees().isEmpty());
    }

    // ------------------------------------------------------------------ create

    @Test
    void createStartsTheProcessAndStoresTheCreator() {
        person("anna", true);
        started("p1");
        open("p1", "t1", "ben", "anna");

        TaskDto created = tasks.create(new CreateTaskRequest("  Review  ", null, null, "  anna ", null, null), "ben");

        assertEquals("p1", created.id());
        Map<String, Object> vars = startVariables();
        assertEquals("anna", vars.get("bpm_assignee"));
        assertEquals("Review", vars.get("bpm_workflowDescription"));
        assertEquals("Review", vars.get("bpm_description"));
        assertEquals(false, vars.get("bpm_sendEMailNotifications"));
        assertFalse(vars.containsKey("bpm_workflowDueDate"));
        verify(client).setProcessVariable("p1", "zapisCreator", "d:text", "ben");
        verify(client, never()).setProcessVariable(eq("p1"), eq("zapisSiteId"), anyString(), any());
        verify(client, never()).setProcessVariable(eq("p1"), eq("zapisDescription"), anyString(), any());
        verify(client, never()).addProcessItems(anyString(), anyList());
    }

    @Test
    void createKeepsTheTrimmedDescriptionAndIgnoresABlankOne() {
        person("anna", true);
        started("p1");
        open("p1", "t1", "ben", "anna");

        tasks.create(new CreateTaskRequest("T", "  details  ", null, "anna", null, null), "ben");
        verify(client).setProcessVariable("p1", "zapisDescription", "d:text", "details");

        tasks.create(new CreateTaskRequest("T", "   ", null, "anna", null, null), "ben");
        verify(client, times(1)).setProcessVariable(eq("p1"), eq("zapisDescription"), anyString(), any());
    }

    @Test
    void dueDatesAreSentInAlfrescosFormat() {
        person("anna", true);
        started("p1");
        open("p1", "t1", "ben", "anna");

        tasks.create(new CreateTaskRequest("T", null, "2026-10-05", "anna", null, null), "ben");
        assertEquals("2026-10-05T00:00:00.000+0000", startVariables().get("bpm_workflowDueDate"));

        tasks.create(new CreateTaskRequest("T", null, "2026-10-05T10:30:00+02:00", "anna", null, null), "ben");
        assertEquals("2026-10-05T10:30:00.000+0200", lastStartVariables().get("bpm_workflowDueDate"));
    }

    @Test
    void aBlankDueDateMeansNone() {
        person("anna", true);
        started("p1");
        open("p1", "t1", "ben", "anna");

        tasks.create(new CreateTaskRequest("T", null, "   ", "anna", null, null), "ben");

        assertFalse(startVariables().containsKey("bpm_workflowDueDate"));
    }

    @Test
    void anInvalidDueDateIsABadRequestAndStartsNothing() {
        person("anna", true);

        for (String bad : List.of("tomorrow", "2026-13-40", "2026-10-05Tnoon")) {
            assertEquals(400, assertThrows(AlfrescoApiException.class,
                    () -> tasks.create(new CreateTaskRequest("T", null, bad, "anna", null, null), "ben")).getStatus(), bad);
        }
        verify(client, never()).startProcess(anyString(), anyMap());
    }

    @Test
    void anUnknownAssigneeIsABadRequest() {
        when(client.getPerson("ghost")).thenThrow(new AlfrescoApiException(404, "no"));

        var e = assertThrows(AlfrescoApiException.class, () -> tasks.create(new CreateTaskRequest("T", null, null, "ghost", null, null), "ben"));

        assertEquals(400, e.getStatus());
        verify(client, never()).startProcess(anyString(), anyMap());
    }

    @Test
    void aDisabledAssigneeIsABadRequest() {
        person("old", false);

        var e = assertThrows(AlfrescoApiException.class, () -> tasks.create(new CreateTaskRequest("T", null, null, "old", null, null), "ben"));

        assertEquals(400, e.getStatus());
        assertTrue(e.getMessage().contains("disabled"));
    }

    @Test
    void otherAssigneeLookupErrorsArePassedOn() {
        when(client.getPerson("anna")).thenThrow(new AlfrescoApiException(500, "boom"));

        assertEquals(500, assertThrows(AlfrescoApiException.class,
                () -> tasks.create(new CreateTaskRequest("T", null, null, "anna", null, null), "ben")).getStatus());
    }

    @Test
    void anAssigneeNameThatCouldBreakOutOfAQueryIsRefused() {
        assertEquals(400, assertThrows(AlfrescoApiException.class,
                () -> tasks.create(new CreateTaskRequest("T", null, null, "a'b", null, null), "ben")).getStatus());
        verifyNoInteractions(client);
    }

    @Test
    void anInvalidSiteIdIsABadRequest() {
        person("anna", true);

        assertEquals(400, assertThrows(AlfrescoApiException.class,
                () -> tasks.create(new CreateTaskRequest("T", null, null, "anna", null, "bad site!"), "ben")).getStatus());
    }

    @Test
    void theSpaceIsDerivedFromTheFirstAttachment() {
        person("anna", true);
        started("p1");
        open("p1", "t1", "ben", "anna");
        when(userClient.getNode("d1", "path")).thenReturn(fileIn("d1", "clients"));
        when(userClient.getNode("d2", "path")).thenReturn(fileIn("d2", "finance"));

        tasks.create(new CreateTaskRequest("T", null, null, "anna", List.of("d1", "d2"), null), "ben");

        verify(client).setProcessVariable("p1", "zapisSiteId", "d:text", "clients");
        verify(client).addProcessItems("p1", List.of("d1", "d2"));
    }

    @Test
    void anExplicitSpaceWinsOverTheAttachmentsSpace() {
        person("anna", true);
        started("p1");
        open("p1", "t1", "ben", "anna");
        when(userClient.getNode("d1", "path")).thenReturn(fileIn("d1", "clients"));

        tasks.create(new CreateTaskRequest("T", null, null, "anna", List.of("d1"), "  finance "), "ben");

        verify(client).setProcessVariable("p1", "zapisSiteId", "d:text", "finance");
    }

    @Test
    void anAttachmentOutsideAnySpaceGivesATaskWithoutASpace() {
        person("anna", true);
        started("p1");
        open("p1", "t1", "ben", "anna");
        when(userClient.getNode("d1", "path")).thenReturn(json(
                "{\"entry\":{\"id\":\"d1\",\"isFile\":true,\"path\":{\"elements\":[{\"name\":\"Company Home\"},{\"name\":\"User Homes\"}]}}}"));

        tasks.create(new CreateTaskRequest("T", null, null, "anna", List.of("d1"), null), "ben");

        verify(client, never()).setProcessVariable(eq("p1"), eq("zapisSiteId"), anyString(), any());
    }

    @Test
    void aSitesFolderAtTheEndOfThePathIsNotASpace() {
        person("anna", true);
        started("p1");
        open("p1", "t1", "ben", "anna");
        when(userClient.getNode("d1", "path")).thenReturn(json(
                "{\"entry\":{\"id\":\"d1\",\"isFile\":true,\"path\":{\"elements\":[{\"name\":\"Company Home\"},{\"name\":\"Sites\"}]}}}"));

        tasks.create(new CreateTaskRequest("T", null, null, "anna", List.of("d1"), null), "ben");

        verify(client, never()).setProcessVariable(eq("p1"), eq("zapisSiteId"), anyString(), any());
    }

    @Test
    void attachmentsMustBeReadableByTheCreator() {
        person("anna", true);
        when(userClient.getNode("d1", "path")).thenThrow(new AlfrescoApiException(403, "no"));

        var e = assertThrows(AlfrescoApiException.class,
                () -> tasks.create(new CreateTaskRequest("T", null, null, "anna", List.of("d1"), null), "ben"));

        assertEquals(403, e.getStatus());
        verify(client, never()).startProcess(anyString(), anyMap());
    }

    @Test
    void missingAttachmentsAreABadRequest() {
        person("anna", true);
        for (int status : new int[]{404, 400}) {
            doThrow(new AlfrescoApiException(status, "no")).when(userClient).getNode("d1", "path");
            var e = assertThrows(AlfrescoApiException.class,
                    () -> tasks.create(new CreateTaskRequest("T", null, null, "anna", List.of("d1"), null), "ben"));
            assertEquals(400, e.getStatus());
        }
    }

    @Test
    void otherAttachmentErrorsArePassedOn() {
        person("anna", true);
        when(userClient.getNode("d1", "path")).thenThrow(new AlfrescoApiException(500, "boom"));

        assertEquals(500, assertThrows(AlfrescoApiException.class,
                () -> tasks.create(new CreateTaskRequest("T", null, null, "anna", List.of("d1"), null), "ben")).getStatus());
    }

    @Test
    void foldersCannotBeAttached() {
        person("anna", true);
        when(userClient.getNode("f1", "path")).thenReturn(json("{\"entry\":{\"id\":\"f1\",\"isFolder\":true,\"isFile\":false}}"));

        var e = assertThrows(AlfrescoApiException.class,
                () -> tasks.create(new CreateTaskRequest("T", null, null, "anna", List.of("f1"), null), "ben"));

        assertEquals(400, e.getStatus());
    }

    @Test
    void aFailureAfterTheProcessStartedRemovesTheProcess() {
        person("anna", true);
        started("p1");
        when(client.addProcessItems(anyString(), anyList())).thenThrow(new AlfrescoApiException(500, "boom"));
        when(userClient.getNode("d1", "path")).thenReturn(fileIn("d1", "clients"));

        var e = assertThrows(AlfrescoApiException.class,
                () -> tasks.create(new CreateTaskRequest("T", null, null, "anna", List.of("d1"), null), "ben"));

        assertEquals(500, e.getStatus());
        verify(client).deleteProcess("p1");
        verifyNoInteractions(hub);
    }

    @Test
    void aFailedCleanupDoesNotHideTheOriginalError() {
        person("anna", true);
        started("p1");
        when(client.setProcessVariable(eq("p1"), eq("zapisCreator"), anyString(), any())).thenThrow(new AlfrescoApiException(500, "boom"));
        doThrow(new RuntimeException("cleanup")).when(client).deleteProcess("p1");

        var e = assertThrows(AlfrescoApiException.class,
                () -> tasks.create(new CreateTaskRequest("T", null, null, "anna", null, null), "ben"));

        assertEquals(500, e.getStatus());
    }

    @Test
    void theAssigneeIsToldAboutANewTask() {
        person("anna", true);
        started("p1");
        open("p1", "t1", "ben", "anna");

        tasks.create(new CreateTaskRequest("Review", null, null, "anna", null, null), "ben");

        verify(hub).publish("anna", new NotificationHub.Event("task-assigned", "p1", "Review", "ben"));
    }

    @Test
    void aTaskForYourselfNotifiesNobody() {
        person("ben", true);
        started("p1");
        open("p1", "t1", "ben", "ben");

        tasks.create(new CreateTaskRequest("Mine", null, null, "ben", null, null), "ben");

        verifyNoInteractions(hub);
    }

    // ------------------------------------------------------------------ update

    @Test
    void theAssigneeCanSetEveryOpenStatus() {
        open("p1", "t1", "ben", "anna");

        tasks.update("p1", "anna", "new", null);
        tasks.update("p1", "anna", "in_progress", null);
        tasks.update("p1", "anna", "on_hold", null);

        verify(client).setTaskVariable("t1", "bpm_status", "d:text", "Not Yet Started", "local");
        verify(client).setTaskVariable("t1", "bpm_status", "d:text", "In Progress", "local");
        verify(client).setTaskVariable("t1", "bpm_status", "d:text", "On Hold", "local");
    }

    @Test
    void anUnknownStatusIsABadRequest() {
        open("p1", "t1", "ben", "anna");

        for (String bad : List.of("done", "bogus", "")) {
            assertEquals(400, assertThrows(AlfrescoApiException.class, () -> tasks.update("p1", "anna", bad, null)).getStatus(), bad);
        }
        verify(client, never()).setTaskVariable(anyString(), anyString(), anyString(), any(), anyString());
    }

    @Test
    void onlyTheAssigneeMayChangeTheStatus() {
        open("p1", "t1", "ben", "anna");

        assertEquals(403, assertThrows(AlfrescoApiException.class, () -> tasks.update("p1", "ben", "on_hold", null)).getStatus());
        assertEquals(403, assertThrows(AlfrescoApiException.class, () -> tasks.update("p1", "carl", "on_hold", null)).getStatus());
        verify(client, never()).setTaskVariable(anyString(), anyString(), anyString(), any(), anyString());
    }

    @Test
    void aFinishedTaskCannotBeChanged() {
        when(client.listTasks(workQuery("p1"))).thenReturn(list(task("p1", "t1", "adhocTask", "completed")));
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna");

        assertEquals(409, assertThrows(AlfrescoApiException.class, () -> tasks.update("p1", "anna", "on_hold", null)).getStatus());
    }

    @Test
    void anUpdateWithAMessageAppendsItAndNotifiesTheCreator() {
        open("p1", "t1", "ben", "anna");
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna", "bpm_workflowDescription", "Review");

        tasks.update("p1", "anna", null, "working on it");

        verify(messages).append("p1", "anna", "working on it");
        verify(hub).publish("ben", new NotificationHub.Event("task-updated", "p1", "Review", "anna"));
        verify(client, never()).setTaskVariable(anyString(), anyString(), anyString(), any(), anyString());
    }

    @Test
    void aBlankMessageIsNotAppended() {
        open("p1", "t1", "ben", "anna");

        tasks.update("p1", "anna", "on_hold", "   ");
        tasks.update("p1", "anna", "on_hold", null);

        verify(messages, never()).append(anyString(), anyString(), anyString());
    }

    @Test
    void cancellingThroughUpdateNeedsAReason() {
        open("p1", "t1", "ben", "anna");

        assertEquals(400, assertThrows(AlfrescoApiException.class, () -> tasks.update("p1", "anna", "cancelled", null)).getStatus());
        assertEquals(400, assertThrows(AlfrescoApiException.class, () -> tasks.update("p1", "anna", "cancelled", " ")).getStatus());
    }

    @Test
    void cancellingThroughUpdateClosesTheTask() {
        open("p1", "t1", "ben", "anna");

        tasks.update("p1", "anna", "cancelled", "no longer needed");

        verify(client).setProcessVariable("p1", "zapisCancelled", "d:text", "true");
        verify(client).setTaskState("t1", "completed");
    }

    // ----------------------------------------------------------------- resolve

    @Test
    void resolvingCompletesTheWorkItem() {
        open("p1", "t1", "ben", "anna");

        tasks.resolve("p1", "anna", null, false);

        verify(client).setTaskVariable("t1", "bpm_status", "d:text", "Completed", "local");
        verify(client).setTaskState("t1", "completed");
        verify(client, never()).setProcessVariable(anyString(), eq("zapisCancelled"), anyString(), any());
        verify(messages, never()).append(anyString(), anyString(), anyString());
    }

    @Test
    void resolvingTellsTheCreatorItIsCompleted() {
        open("p1", "t1", "ben", "anna");
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna", "bpm_workflowDescription", "Review");

        tasks.resolve("p1", "anna", "all good", false);

        verify(messages).append("p1", "anna", "all good");
        verify(hub).publish("ben", new NotificationHub.Event("task-completed", "p1", "Review", "anna"));
    }

    @Test
    void cancellingKeepsTheReasonAndMarksTheTaskCancelled() {
        open("p1", "t1", "ben", "anna");
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna", "bpm_workflowDescription", "Review");

        tasks.resolve("p1", "anna", "  duplicate  ", true);

        verify(messages).append("p1", "anna", "Cancelation information: duplicate");
        verify(client).setProcessVariable("p1", "zapisCancelled", "d:text", "true");
        verify(hub).publish("ben", new NotificationHub.Event("task-updated", "p1", "Review", "anna"));
    }

    @Test
    void cancellingWithoutAReasonChangesNothing() {
        open("p1", "t1", "ben", "anna");

        assertEquals(400, assertThrows(AlfrescoApiException.class, () -> tasks.resolve("p1", "anna", null, true)).getStatus());
        assertEquals(400, assertThrows(AlfrescoApiException.class, () -> tasks.resolve("p1", "anna", "  ", true)).getStatus());
        verify(client, never()).setTaskState(anyString(), anyString());
        verifyNoInteractions(hub);
    }

    @Test
    void onlyTheAssigneeCanResolveAnOpenTask() {
        open("p1", "t1", "ben", "anna");

        assertEquals(403, assertThrows(AlfrescoApiException.class, () -> tasks.resolve("p1", "ben", null, false)).getStatus());
        verify(client, never()).setTaskState(anyString(), anyString());
    }

    @Test
    void aTaskCannotBeResolvedTwice() {
        when(client.listTasks(workQuery("p1"))).thenReturn(list(task("p1", "t1", "adhocTask", "completed")));
        variables("p1", "zapisCreator", "ben", "bpm_assignee", "anna");

        assertEquals(409, assertThrows(AlfrescoApiException.class, () -> tasks.resolve("p1", "anna", null, false)).getStatus());
    }

    @Test
    void resolvingAYourOwnTaskNotifiesNobody() {
        open("p1", "t1", "anna", "anna");

        tasks.resolve("p1", "anna", null, false);

        verifyNoInteractions(hub);
    }

    // ----------------------------------------------------------- notifications

    @Test
    void notificationsAreTheOpenDoneNoticesOfMyTasksNewestFirst() {
        when(client.listTasks("(status='active' AND variables/zapisCreator = 'd_text ben')")).thenReturn(list(
                notice("n1", "p1", "verifyTaskDone", "completed task one", "2026-10-01T09:00:00.000+0000"),
                notice("n2", "p2", "verifyTaskDone", "completed task two", "2026-10-02T09:00:00.000+0000"),
                notice("w3", "p3", "adhocTask", "still open", "2026-10-03T09:00:00.000+0000")));
        variables("p1", "bpm_assignee", "anna");
        variables("p2", "bpm_assignee", "carl");

        List<TaskNotificationDto> result = tasks.notifications("ben");

        assertEquals(List.of(
                new TaskNotificationDto("n2", "p2", "completed task two", "carl", "2026-10-02T09:00Z"),
                new TaskNotificationDto("n1", "p1", "completed task one", "anna", "2026-10-01T09:00Z")), result);
    }

    @Test
    void noNoticesGivesAnEmptyList() {
        when(client.listTasks(anyString())).thenReturn(list());

        assertTrue(tasks.notifications("ben").isEmpty());
    }

    @Test
    void notificationQueriesRefuseUnsafeUsernames() {
        assertEquals(400, assertThrows(AlfrescoApiException.class, () -> tasks.notifications("b'en")).getStatus());
    }

    @Test
    void theCreatorCanDismissADoneNotice() {
        when(client.getTask("n1")).thenReturn(json("{\"entry\":{\"id\":\"n1\",\"processId\":\"p1\","
                + "\"activityDefinitionId\":\"verifyTaskDone\",\"state\":\"unclaimed\"}}"));
        variables("p1", "zapisCreator", "ben");

        tasks.dismissNotification("n1", "ben");

        verify(client).setTaskState("n1", "completed");
    }

    @Test
    void aNoticeThatIsNotTheCallersIsNotFound() {
        when(client.getTask("n1")).thenReturn(json("{\"entry\":{\"id\":\"n1\",\"processId\":\"p1\","
                + "\"activityDefinitionId\":\"verifyTaskDone\",\"state\":\"unclaimed\"}}"));
        variables("p1", "zapisCreator", "ben");

        assertEquals(404, assertThrows(AlfrescoApiException.class, () -> tasks.dismissNotification("n1", "anna")).getStatus());
        verify(client, never()).setTaskState(anyString(), anyString());
    }

    @Test
    void aNoticeThatIsAlreadyDismissedIsNotFound() {
        when(client.getTask("n1")).thenReturn(json("{\"entry\":{\"id\":\"n1\",\"processId\":\"p1\","
                + "\"activityDefinitionId\":\"verifyTaskDone\",\"state\":\"completed\"}}"));
        variables("p1", "zapisCreator", "ben");

        assertEquals(404, assertThrows(AlfrescoApiException.class, () -> tasks.dismissNotification("n1", "ben")).getStatus());
    }

    @Test
    void dismissingTheWorkItemItselfIsNotAllowed() {
        when(client.getTask("t1")).thenReturn(json("{\"entry\":{\"id\":\"t1\",\"processId\":\"p1\","
                + "\"activityDefinitionId\":\"adhocTask\",\"state\":\"unclaimed\"}}"));
        variables("p1", "zapisCreator", "ben");

        assertEquals(404, assertThrows(AlfrescoApiException.class, () -> tasks.dismissNotification("t1", "ben")).getStatus());
        verify(client, never()).setTaskState(anyString(), anyString());
    }

    // ---------------------------------------------------------------- helpers

    /** An open task p1/t1: the work item exists, and the process knows its creator and assignee. */
    private void open(String processId, String taskId, String creator, String assignee) {
        when(client.listTasks(workQuery(processId))).thenReturn(list(
                task(processId, taskId + "-other", "verifyTaskDone", "unclaimed"),
                task(processId, taskId, "adhocTask", "unclaimed")));
        variables(processId, "zapisCreator", creator, "bpm_assignee", assignee);
    }

    private static String workQuery(String processId) {
        return "(status='any' AND processId='" + processId + "')";
    }

    private void variables(String processId, String... nameValuePairs) {
        List<String> entries = new java.util.ArrayList<>();
        for (int i = 0; i < nameValuePairs.length; i += 2) {
            entries.add("{\"entry\":{\"name\":\"" + nameValuePairs[i] + "\",\"value\":\"" + nameValuePairs[i + 1] + "\"}}");
        }
        when(client.listProcessVariables(processId)).thenReturn(list(entries.toArray(String[]::new)));
    }

    private void person(String id, boolean enabled) {
        when(client.getPerson(id)).thenReturn(json("{\"entry\":{\"id\":\"" + id + "\",\"enabled\":" + enabled + "}}"));
    }

    private void started(String processId) {
        when(client.startProcess(eq("activitiAdhoc"), anyMap())).thenReturn(json("{\"entry\":{\"id\":\"" + processId + "\"}}"));
    }

    private JsonNode fileIn(String id, String siteId) {
        return json("{\"entry\":{\"id\":\"" + id + "\",\"isFile\":true,\"path\":{\"elements\":["
                + "{\"name\":\"Company Home\"},{\"name\":\"Sites\"},{\"name\":\"" + siteId + "\"},{\"name\":\"documentLibrary\"}]}}}");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> startVariables() {
        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(client, org.mockito.Mockito.atLeastOnce()).startProcess(eq("activitiAdhoc"), captor.capture());
        return new LinkedHashMap<>(captor.getAllValues().getFirst());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> lastStartVariables() {
        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(client, org.mockito.Mockito.atLeastOnce()).startProcess(eq("activitiAdhoc"), captor.capture());
        return new LinkedHashMap<>(captor.getAllValues().getLast());
    }

    private JsonNode json(String s) {
        return mapper.readTree(s);
    }

    private JsonNode list(String... entries) {
        return json("{\"list\":{\"entries\":[" + String.join(",", entries) + "]}}");
    }

    private String task(String processId, String taskId, String activity, String state) {
        return task(processId, taskId, activity, state, STARTED, null);
    }

    private String task(String processId, String taskId, String activity, String state, String startedAt, String dueAt) {
        return ("{\"entry\":{\"id\":\"" + taskId + "\",\"processId\":\"" + processId
                + "\",\"activityDefinitionId\":\"" + activity + "\",\"state\":\"" + state + "\",\"description\":\"desc " + processId
                + "\",\"startedAt\":\"" + startedAt + "\"" + (dueAt == null ? "" : ",\"dueAt\":\"" + dueAt + "\"") + "}}");
    }

    private String notice(String taskId, String processId, String activity, String description, String startedAt) {
        return ("{\"entry\":{\"id\":\"" + taskId + "\",\"processId\":\"" + processId
                + "\",\"activityDefinitionId\":\"" + activity + "\",\"description\":\"" + description
                + "\",\"startedAt\":\"" + startedAt + "\"}}");
    }

    private String item(String id, String name) {
        return "{\"entry\":{\"id\":\"" + id + "\",\"name\":\"" + name + "\"}}";
    }
}
