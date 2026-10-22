package ch.dmspoc.api.service;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Pushes live events to the browsers of signed-in users over Server-Sent Events. Events carry only a type and
 * what is needed to word a toast; the client refetches the data itself, so access rules stay in the services.
 * Connections live in memory (one per open tab), like the HTTP sessions: a restart drops them and
 * {@code EventSource} reconnects on its own.
 */
@Service
public class NotificationHub {

    private static final Logger log = LoggerFactory.getLogger(NotificationHub.class);
    private static final long HEARTBEAT_SECONDS = 25;

    /** What happened, to which task, and who caused it ({@code title} may be null). */
    public record Event(String type, String taskId, String title, String from) {}

    private final Map<String, List<SseEmitter>> emitters = new ConcurrentHashMap<>();
    private final ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "sse-heartbeat");
        t.setDaemon(true);
        return t;
    });

    public NotificationHub() {
        // Keeps idle connections open through proxies and notices tabs that went away.
        heartbeat.scheduleAtFixedRate(this::ping, HEARTBEAT_SECONDS, HEARTBEAT_SECONDS, TimeUnit.SECONDS);
    }

    public SseEmitter subscribe(String user) {
        SseEmitter emitter = new SseEmitter(0L);
        List<SseEmitter> mine = emitters.computeIfAbsent(user, u -> new CopyOnWriteArrayList<>());
        mine.add(emitter);
        Runnable remove = () -> mine.remove(emitter);
        emitter.onCompletion(remove);
        emitter.onTimeout(remove);
        emitter.onError(e -> remove.run());
        try {
            emitter.send(SseEmitter.event().name("ready").data("ok"));
        } catch (IOException e) {
            remove.run();
        }
        return emitter;
    }

    /** Sends the event to every open tab of {@code user}; never throws, a push is best effort. */
    public void publish(String user, Event event) {
        List<SseEmitter> mine = emitters.get(user);
        if (mine == null) return;
        for (SseEmitter emitter : mine) {
            try {
                emitter.send(SseEmitter.event().name("task").data(event));
            } catch (IOException | IllegalStateException e) {
                mine.remove(emitter);
                log.debug("Dropped a closed notification stream for {}", user);
            }
        }
    }

    private void ping() {
        emitters.forEach((user, mine) -> {
            for (SseEmitter emitter : mine) {
                try {
                    emitter.send(SseEmitter.event().comment("keep-alive"));
                } catch (IOException | IllegalStateException e) {
                    mine.remove(emitter);
                }
            }
        });
    }

    @PreDestroy
    void shutdown() {
        heartbeat.shutdownNow();
    }
}
