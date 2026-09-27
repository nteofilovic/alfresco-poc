package ch.dmspoc.api.controller;

import ch.dmspoc.api.dto.LoginRequest;
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

    private final RestClient alfrescoAuthProbeRestClient;

    public AuthController(RestClient alfrescoAuthProbeRestClient) {
        this.alfrescoAuthProbeRestClient = alfrescoAuthProbeRestClient;
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, String>> login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        String basicAuth = "Basic " + Base64.getEncoder().encodeToString(
                (request.username() + ":" + request.password()).getBytes(StandardCharsets.UTF_8));

        try {
            alfrescoAuthProbeRestClient.get()
                    .uri("/people/-me-")
                    .header(HttpHeaders.AUTHORIZATION, basicAuth)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException e) {
            return ResponseEntity.status(401).body(Map.of("message", "Invalid username or password"));
        }

        httpRequest.getSession(true).setAttribute(SESSION_USER_ATTR, request.username());
        return ResponseEntity.ok(Map.of("username", request.username()));
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
    public ResponseEntity<Map<String, String>> me(HttpServletRequest httpRequest) {
        HttpSession session = httpRequest.getSession(false);
        Object username = session != null ? session.getAttribute(SESSION_USER_ATTR) : null;
        if (username == null) {
            return ResponseEntity.status(401).body(Map.of("message", "Not logged in"));
        }
        return ResponseEntity.ok(Map.of("username", (String) username));
    }
}
