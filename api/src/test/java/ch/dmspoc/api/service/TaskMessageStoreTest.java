package ch.dmspoc.api.service;

import ch.dmspoc.api.exception.AlfrescoApiException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class TaskMessageStoreTest {

    /** Keeps the sub-folder files in memory instead of Alfresco. */
    static class InMemoryStore extends ConfigStore {
        final Map<String, byte[]> files = new HashMap<>();

        InMemoryStore() {
            super(null);
        }

        @Override
        public Optional<byte[]> read(String subFolder, String fileName) {
            return Optional.ofNullable(files.get(subFolder + "/" + fileName));
        }

        @Override
        public void write(String subFolder, String fileName, byte[] content, String contentType) {
            files.put(subFolder + "/" + fileName, content);
        }
    }

    private final TaskMessageStore store = new TaskMessageStore(new InMemoryStore(), new ObjectMapper());

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
}
