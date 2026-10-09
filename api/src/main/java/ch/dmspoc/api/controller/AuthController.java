package ch.dmspoc.api.controller;

import ch.dmspoc.api.dto.LoginRequest;
import tools.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

/**
 * Login gate in front of the app: validates the submitted username/password against Alfresco's
 * own "who am I" endpoint and, on success, marks the HTTP session as authenticated. Every other
 * /api/** call still goes through the shared service account configured in application.yml
 * (see README "Notes on what's simplified for a POC") - this only decides who may use the UI.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    public static final String SESSION_USER_ATTR = "authUser";
    public static final String SESSION_ADMIN_ATTR = "authIsAdmin";

    private final RestClient alfrescoAuthProbeRestClient;

    public AuthController(RestClient alfrescoAuthProbeRestClient) {
        this.alfrescoAuthProbeRestClient = alfrescoAuthProbeRestClient;
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        String basicAuth = "Basic " + Base64.getEncoder().encodeToString(
                (request.username() + ":" + request.password()).getBytes(StandardCharsets.UTF_8));

        boolean isAdmin;
        try {
            JsonNode person = alfrescoAuthProbeRestClient.get()
                    .uri("/people/-me-?include=capabilities")
                    .header(HttpHeaders.AUTHORIZATION, basicAuth)
                    .retrieve()
                    .body(JsonNode.class);
            isAdmin = person != null && person.path("entry").path("capabilities").path("isAdmin").asBoolean(false);
        } catch (RestClientResponseException e) {
            return ResponseEntity.status(401).body(Map.of("message", "Invalid username or password"));
        }

        HttpSession session = httpRequest.getSession(true);
        session.setAttribute(SESSION_USER_ATTR, request.username());
        session.setAttribute(SESSION_ADMIN_ATTR, isAdmin);
        return ResponseEntity.ok(Map.of("username", request.username(), "isAdmin", isAdmin));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest httpRequest) {
        HttpSession session = httpRequest.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> me(HttpServletRequest httpRequest) {
        HttpSession session = httpRequest.getSession(false);
        Object username = session != null ? session.getAttribute(SESSION_USER_ATTR) : null;
        if (username == null) {
            return ResponseEntity.status(401).body(Map.of("message", "Not logged in"));
        }
        boolean isAdmin = Boolean.TRUE.equals(session.getAttribute(SESSION_ADMIN_ATTR));
        return ResponseEntity.ok(Map.of("username", username, "isAdmin", isAdmin));
    }
}
