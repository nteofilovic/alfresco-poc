package ch.dmspoc.api.controller;

import ch.dmspoc.api.service.NotificationHub;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Live push channel for the signed-in user; guarded by {@link ch.dmspoc.api.config.AuthInterceptor} like the rest of /api/**. */
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationHub hub;

    public NotificationController(NotificationHub hub) {
        this.hub = hub;
    }

    @GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(HttpSession session, HttpServletResponse response) {
        // Tell proxies not to buffer the stream.
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("X-Accel-Buffering", "no");
        return hub.subscribe((String) session.getAttribute(AuthController.SESSION_USER_ATTR));
    }
}
