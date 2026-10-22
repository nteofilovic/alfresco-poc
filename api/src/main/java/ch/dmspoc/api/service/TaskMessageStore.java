
package ch.dmspoc.api.service;

import ch.dmspoc.api.exception.AlfrescoApiException;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The conversation on a task: {@code zapis-config/task-messages/<taskId>.json}, one append-only list of messages plus,
 * per user, how many of them they have seen. Messages get their id and timestamp here, never from the client.
 * Access is checked by the caller (creator or assignee) before anything here is used, because this store runs as the
 * service account.
 */
@Component
public class TaskMessageStore {

    static final String FOLDER = "task-messages";
    static final int MAX_LENGTH = 2000;

    public record Message(String id, String author, String text, String createdAt) {
    }

    /** @param readBy username to the number of messages (from the start of the list) that user has seen */
    public record Thread(List<Message> messages, Map<String, Integer> readBy) {
    }

    private final ConfigStore store;
    private final ObjectMapper mapper;
    /** Appends and read marks are read-modify-write on one file, so they are serialized per task. */
    private final Map<String, Object> locks = new ConcurrentHashMap<>();

    public TaskMessageStore(ConfigStore store, ObjectMapper mapper) {
        this.store = store;
        this.mapper = mapper;
    }

    public Thread thread(String taskId) {
        return store.read(FOLDER, taskId + ".json")
                .map(bytes -> mapper.readValue(bytes, Thread.class))
                .orElseGet(() -> new Thread(List.of(), Map.of()));
    }

    public Message append(String taskId, String author, String text) {
        String clean = text == null ? "" : text.trim();
        if (clean.isEmpty()) throw new AlfrescoApiException(400, "Message is empty");
        if (clean.length() > MAX_LENGTH) throw new AlfrescoApiException(400, "Message is longer than " + MAX_LENGTH + " characters");
        synchronized (lock(taskId)) {
            Thread current = thread(taskId);
            Message message = new Message(UUID.randomUUID().toString(), author, clean, Instant.now().toString());
            List<Message> messages = new ArrayList<>(current.messages());
            messages.add(message);
            Map<String, Integer> readBy = new HashMap<>(current.readBy());
            // Writing a message means having read everything before it.
            readBy.put(author, messages.size());
            save(taskId, new Thread(messages, readBy));
            return message;
        }
    }

    /** Marks read using a thread the caller just loaded, so the common case (nothing new) costs no extra reads. */
    public void markRead(String taskId, String user, Thread loaded) {
        if (loaded.readBy().getOrDefault(user, 0) >= loaded.messages().size()) return;
        markRead(taskId, user);
    }

    public void markRead(String taskId, String user) {
        synchronized (lock(taskId)) {
            Thread current = thread(taskId);
            if (current.readBy().getOrDefault(user, 0) >= current.messages().size()) return;
            Map<String, Integer> readBy = new HashMap<>(current.readBy());
            readBy.put(user, current.messages().size());
            save(taskId, new Thread(current.messages(), readBy));
        }
    }

    /** Messages from the other party that {@code user} has not seen yet. */
    public int unread(String taskId, String user) {
        return summary(taskId, user).unread();
    }

    /** What a task list row shows of a conversation, from one read of the thread. */
    public record Summary(int unread, int count) {
    }

    public Summary summary(String taskId, String user) {
        Thread current = thread(taskId);
        List<Message> all = current.messages();
        int seen = current.readBy().getOrDefault(user, 0);
        int unread = 0;
        for (int i = seen; i < all.size(); i++) {
            if (!user.equals(all.get(i).author())) unread++;
        }
        return new Summary(unread, all.size());
    }

    private void save(String taskId, Thread thread) {
        store.write(FOLDER, taskId + ".json", mapper.writeValueAsBytes(thread), "application/json");
    }

    private Object lock(String taskId) {
        return locks.computeIfAbsent(taskId, k -> new Object());
    }
}
