package ch.dmspoc.api.service;

import ch.dmspoc.api.exception.AlfrescoApiException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class TaskMessageStoreTest {

    /** Keeps the sub-folder files in memory instead of Alfresco. */
    static class InMemoryStore extends ConfigStore {
        final Map<String, byte[]> files = new HashMap<>();
        int writes;

        InMemoryStore() {
            super(null);
        }

        @Override
        public Optional<byte[]> read(String subFolder, String fileName) {
            return Optional.ofNullable(files.get(subFolder + "/" + fileName));
        }

        @Override
        public void write(String subFolder, String fileName, byte[] content, String contentType) {
            writes++;
            files.put(subFolder + "/" + fileName, content);
        }
    }

    private final InMemoryStore files = new InMemoryStore();
    private final TaskMessageStore store = new TaskMessageStore(files, new ObjectMapper());

    @Test
    void appendsInOrderWithServerIdAndTimestamp() {
        store.append("t1", "anna", "first");
        store.append("t1", "ben", "second");

        var messages = store.thread("t1").messages();
        assertEquals(2, messages.size());
        assertEquals("first", messages.get(0).text());
        assertEquals("ben", messages.get(1).author());
        assertNotNull(messages.get(0).id());
        assertNotNull(messages.get(0).createdAt());
    }

    @Test
    void unreadCountsOnlyTheOtherPartysMessagesUntilOpened() {
        store.append("t1", "anna", "please look at this");
        store.append("t1", "anna", "and this");

        assertEquals(2, store.unread("t1", "ben"));
        assertEquals(0, store.unread("t1", "anna"));

        store.markRead("t1", "ben");
        assertEquals(0, store.unread("t1", "ben"));

        store.append("t1", "anna", "one more");
        assertEquals(1, store.unread("t1", "ben"));
    }

    @Test
    void writingAReplyMarksEverythingBeforeItAsRead() {
        store.append("t1", "anna", "question");
        store.append("t1", "ben", "answer");

        assertEquals(0, store.unread("t1", "ben"));
        assertEquals(1, store.unread("t1", "anna"));
    }

    @Test
    void conversationsAreSeparatePerTask() {
        store.append("t1", "anna", "hello");
        assertEquals(0, store.unread("t2", "ben"));
        assertEquals(0, store.thread("t2").messages().size());
    }

    @Test
    void rejectsBlankAndOverlongMessages() {
        assertThrows(AlfrescoApiException.class, () -> store.append("t1", "anna", "   "));
        assertThrows(AlfrescoApiException.class, () -> store.append("t1", "anna", null));
        assertThrows(AlfrescoApiException.class,
                () -> store.append("t1", "anna", "x".repeat(TaskMessageStore.MAX_LENGTH + 1)));
    }

    @Test
    void messagesAreTrimmedBeforeTheyAreStored() {
        var message = store.append("t1", "anna", "   padded  \n");

        assertEquals("padded", message.text());
        assertEquals("padded", store.thread("t1").messages().getFirst().text());
    }

    @Test
    void aMessageOfExactlyTheMaximumLengthIsAccepted() {
        assertEquals(TaskMessageStore.MAX_LENGTH, store.append("t1", "anna", "x".repeat(TaskMessageStore.MAX_LENGTH)).text().length());
    }

    @Test
    void theLengthLimitAppliesAfterTrimming() {
        String padded = " " + "x".repeat(TaskMessageStore.MAX_LENGTH) + " ";

        assertEquals(TaskMessageStore.MAX_LENGTH, store.append("t1", "anna", padded).text().length());
    }

    @Test
    void aRefusedMessageStoresNothing() {
        assertThrows(AlfrescoApiException.class, () -> store.append("t1", "anna", ""));

        assertEquals(0, files.writes);
        assertEquals(0, store.thread("t1").messages().size());
    }

    @Test
    void messageIdsAreUnique() {
        var first = store.append("t1", "anna", "a");
        var second = store.append("t1", "anna", "b");

        assertNotEquals(first.id(), second.id());
    }

    @Test
    void thereIsNothingUnreadInAnEmptyConversation() {
        assertEquals(0, store.unread("t1", "ben"));
        assertEquals(new TaskMessageStore.Summary(0, 0), store.summary("t1", "ben"));
    }

    @Test
    void aUserWhoNeverOpenedTheTaskSeesEveryoneElsesMessagesAsUnread() {
        store.append("t1", "anna", "1");
        store.append("t1", "ben", "2");
        store.append("t1", "anna", "3");

        assertEquals(new TaskMessageStore.Summary(1, 3), store.summary("t1", "ben"));
        assertEquals(new TaskMessageStore.Summary(3, 3), store.summary("t1", "carl"));
    }

    @Test
    void readMarksAreKeptPerUser() {
        store.append("t1", "anna", "hello");

        store.markRead("t1", "ben");

        assertEquals(0, store.unread("t1", "ben"));
        assertEquals(1, store.unread("t1", "carl"));
    }

    @Test
    void markingReadWhenNothingIsNewWritesNothing() {
        store.append("t1", "anna", "hello");
        store.markRead("t1", "ben");
        int writes = files.writes;

        store.markRead("t1", "ben");
        store.markRead("t1", "anna"); // the author has already read their own message
        store.markRead("t2", "ben"); // no conversation at all

        assertEquals(writes, files.writes);
    }

    @Test
    void markingReadWithTheLoadedThreadSkipsTheReadWhenUpToDate() {
        store.append("t1", "anna", "hello");
        store.markRead("t1", "ben");
        var loaded = store.thread("t1");
        int writes = files.writes;

        store.markRead("t1", "ben", loaded);

        assertEquals(writes, files.writes);
    }

    @Test
    void markingReadWithTheLoadedThreadStoresTheNewMark() {
        store.append("t1", "anna", "hello");
        var loaded = store.thread("t1");

        store.markRead("t1", "ben", loaded);

        assertEquals(0, store.unread("t1", "ben"));
    }

    @Test
    void markingReadKeepsTheMessagesIntact() {
        store.append("t1", "anna", "hello");
        store.markRead("t1", "ben");

        assertEquals(1, store.thread("t1").messages().size());
        assertEquals("hello", store.thread("t1").messages().getFirst().text());
    }

    @Test
    void aDamagedThreadFileIsReportedNotIgnored() {
        files.files.put("task-messages/t1.json", "not json".getBytes());

        assertThrows(RuntimeException.class, () -> store.thread("t1"));
    }

    @Test
    void concurrentRepliesAreAllKept() throws Exception {
        int writers = 12;
        var pool = java.util.concurrent.Executors.newFixedThreadPool(writers);
        try {
            var calls = new java.util.ArrayList<java.util.concurrent.Callable<Object>>();
            for (int i = 0; i < writers; i++) {
                int n = i;
                calls.add(() -> store.append("t1", "user" + n, "message " + n));
            }
            for (var f : pool.invokeAll(calls)) f.get();
        } finally {
            pool.shutdownNow();
        }

        assertEquals(writers, store.thread("t1").messages().size());
    }
}
