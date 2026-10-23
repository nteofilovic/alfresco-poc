package ch.dmspoc.api.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NotificationHubTest {

    private NotificationHub hub;

    @BeforeEach
    void setUp() {
        hub = new NotificationHub();
    }

    @AfterEach
    void tearDown() {
        hub.shutdown();
    }

    @Test
    void subscribingRegistersAnEmitterForTheUser() {
        SseEmitter emitter = hub.subscribe("anna");

        assertNotNull(emitter);
        assertEquals(List.of(emitter), emitters().get("anna"));
    }

    @Test
    void subscriptionsNeverTimeOut() {
        assertEquals(0L, hub.subscribe("anna").getTimeout());
    }

    @Test
    void everyOpenTabGetsItsOwnEmitter() {
        SseEmitter first = hub.subscribe("anna");
        SseEmitter second = hub.subscribe("anna");

        assertNotSame(first, second);
        assertEquals(2, emitters().get("anna").size());
    }

    @Test
    void usersAreKeptApart() {
        hub.subscribe("anna");
        hub.subscribe("ben");

        assertEquals(2, emitters().size());
        assertEquals(1, emitters().get("ben").size());
    }

    @Test
    void publishingToSomeoneWithoutATabIsHarmless() {
        assertDoesNotThrow(() -> hub.publish("nobody", event()));
        assertNull(emitters().get("nobody"));
    }

    @Test
    void publishingToAnOpenTabKeepsIt() {
        SseEmitter emitter = hub.subscribe("anna");

        hub.publish("anna", event());

        assertEquals(List.of(emitter), emitters().get("anna"));
    }

    @Test
    void aClosedTabIsDroppedOnPublish() {
        SseEmitter closed = hub.subscribe("anna");
        SseEmitter open = hub.subscribe("anna");
        closed.complete();

        assertDoesNotThrow(() -> hub.publish("anna", event()));

        assertEquals(List.of(open), emitters().get("anna"));
    }

    @Test
    void publishNeverThrowsEvenWhenEveryTabIsGone() {
        hub.subscribe("anna").complete();
        hub.subscribe("anna").complete();

        assertDoesNotThrow(() -> hub.publish("anna", event()));

        assertTrue(emitters().get("anna").isEmpty());
    }

    @Test
    void theHeartbeatDropsClosedTabsAndKeepsOpenOnes() {
        SseEmitter closed = hub.subscribe("anna");
        SseEmitter open = hub.subscribe("anna");
        closed.complete();

        ReflectionTestUtils.invokeMethod(hub, "ping");

        assertEquals(List.of(open), emitters().get("anna"));
    }

    @Test
    void theHeartbeatWithoutSubscribersDoesNothing() {
        assertDoesNotThrow(() -> ReflectionTestUtils.invokeMethod(hub, "ping"));
    }

    @Test
    void shutdownCanBeCalledMoreThanOnce() {
        assertDoesNotThrow(() -> {
            hub.shutdown();
            hub.shutdown();
        });
    }

    @Test
    void anEventCarriesItsFieldsAndAllowsANullTitle() {
        var event = new NotificationHub.Event("task-assigned", "p1", null, "anna");

        assertEquals("task-assigned", event.type());
        assertEquals("p1", event.taskId());
        assertNull(event.title());
        assertEquals("anna", event.from());
    }

    @SuppressWarnings("unchecked")
    private Map<String, List<SseEmitter>> emitters() {
        return (Map<String, List<SseEmitter>>) ReflectionTestUtils.getField(hub, "emitters");
    }

    private static NotificationHub.Event event() {
        return new NotificationHub.Event("task-updated", "p1", "Title", "ben");
    }
}
