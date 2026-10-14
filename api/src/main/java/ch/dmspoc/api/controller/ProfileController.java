package ch.dmspoc.api.controller;

import ch.dmspoc.api.dto.ChangePasswordRequest;
import ch.dmspoc.api.dto.UpdateProfileRequest;
import ch.dmspoc.api.service.AlfrescoClient;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

/**
 * Self-service profile for the logged-in user. The person is always taken from the HTTP session,
 * never from the request. /api/** is guarded by {@link ch.dmspoc.api.config.AuthInterceptor}.
 */
@RestController
@RequestMapping("/api/profile")
public class ProfileController {

    private final AlfrescoClient alfrescoClient;
    private final RestClient alfrescoAuthProbeRestClient;

    public ProfileController(@Qualifier("serviceAlfrescoClient") AlfrescoClient alfrescoClient, RestClient alfrescoAuthProbeRestClient) {
        this.alfrescoClient = alfrescoClient;
        this.alfrescoAuthProbeRestClient = alfrescoAuthProbeRestClient;
    }

    @GetMapping
    public Map<String, Object> get(HttpSession session) {
        return toDto(alfrescoClient.getPerson(currentUser(session)).path("entry"), currentUser(session));
    }

    @PutMapping
    public Map<String, Object> update(@Valid @RequestBody UpdateProfileRequest request, HttpSession session) {
        String username = currentUser(session);
        JsonNode entry = alfrescoClient
                .updatePerson(username, request.firstName().trim(), request.lastName(), request.email().trim())
                .path("entry");
        Map<String, Object> dto = toDto(entry, username);
        session.setAttribute(AuthController.SESSION_FIRSTNAME_ATTR, dto.get("firstName"));
        return dto;
    }

    @PostMapping("/password")
    public ResponseEntity<Map<String, Object>> changePassword(@Valid @RequestBody ChangePasswordRequest request, HttpSession session) {
        String username = currentUser(session);
        // The shared service account is admin, so Alfresco would not ask for the old password: verify it ourselves.
        String basicAuth = "Basic " + Base64.getEncoder().encodeToString(
                (username + ":" + request.currentPassword()).getBytes(StandardCharsets.UTF_8));
        try {
            alfrescoAuthProbeRestClient.get()
                    .uri("/people/-me-")
                    .header(HttpHeaders.AUTHORIZATION, basicAuth)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException e) {
            return ResponseEntity.badRequest().body(Map.of("status", 400, "message", "Current password is incorrect"));
        }
        alfrescoClient.updatePersonPassword(username, request.newPassword());
        return ResponseEntity.noContent().build();
    }

    private static String currentUser(HttpSession session) {
        return (String) session.getAttribute(AuthController.SESSION_USER_ATTR);
    }

    private static Map<String, Object> toDto(JsonNode entry, String username) {
        return Map.of(
                "username", username,
                "firstName", entry.path("firstName").asText(""),
                "lastName", entry.path("lastName").asText(""),
                "email", entry.path("email").asText(""));
    }
}
