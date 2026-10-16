package ch.dmspoc.api.controller;

import ch.dmspoc.api.config.RestClientConfig;
import ch.dmspoc.api.dto.LoginRequest;
import tools.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.Map;

/**
 * Login gate in front of the app. Credentials are exchanged with Alfresco for a login ticket, which
 * is kept in the HTTP session; content calls are then made with that ticket (see
 * {@link ch.dmspoc.api.config.UserTicketContext}) so Alfresco's ACLs apply to the real user. The shared
 * service account is only used for admin operations (sites, people) and the workflow engine.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    public static final String SESSION_USER_ATTR = "authUser";
    public static final String SESSION_ADMIN_ATTR = "authIsAdmin";
    public static final String SESSION_FIRSTNAME_ATTR = "authFirstName";
    public static final String SESSION_TICKET_ATTR = "authTicket";

    private final RestClient alfrescoAuthRestClient;
    private final RestClient alfrescoAuthProbeRestClient;

    public AuthController(RestClient alfrescoAuthRestClient, RestClient alfrescoAuthProbeRestClient) {
        this.alfrescoAuthRestClient = alfrescoAuthRestClient;
        this.alfrescoAuthProbeRestClient = alfrescoAuthProbeRestClient;
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        String ticket;
        boolean isAdmin;
        String firstName;
        try {
            JsonNode created = alfrescoAuthRestClient.post()
                    .uri("/tickets")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("userId", request.username(), "password", request.password()))
                    .retrieve()
                    .body(JsonNode.class);
            ticket = created != null ? created.path("entry").path("id").asText("") : "";
            if (ticket.isEmpty()) {
                return ResponseEntity.status(502).body(Map.of("message", "Alfresco did not issue a login ticket"));
            }
            JsonNode person = alfrescoAuthProbeRestClient.get()
                    .uri("/people/-me-?include=capabilities")
                    .header(HttpHeaders.AUTHORIZATION, RestClientConfig.ticketAuthHeader(ticket))
                    .retrieve()
                    .body(JsonNode.class);
            JsonNode entry = person != null ? person.path("entry") : null;
            isAdmin = entry != null && entry.path("capabilities").path("isAdmin").asBoolean(false);
            firstName = entry != null ? entry.path("firstName").asText(request.username()) : request.username();
        } catch (RestClientResponseException e) {
            // Alfresco answers 403 (sometimes 401) for wrong credentials; anything else is not the user's fault.
            int status = e.getStatusCode().value();
            if (status == 401 || status == 403) {
                return ResponseEntity.status(401).body(Map.of("message", "Invalid username or password"));
            }
            return ResponseEntity.status(502).body(Map.of("message", "Alfresco is not available (HTTP " + status + ")"));
        } catch (ResourceAccessException e) {
            return ResponseEntity.status(502).body(Map.of("message", "Alfresco is not reachable"));
        }

        // Fresh session id on login (session fixation); reuse the session if one already exists.
        HttpSession session = httpRequest.getSession(false);
        if (session == null) {
            session = httpRequest.getSession(true);
        } else {
            httpRequest.changeSessionId();
        }
        session.setAttribute(SESSION_USER_ATTR, request.username());
        session.setAttribute(SESSION_ADMIN_ATTR, isAdmin);
        session.setAttribute(SESSION_FIRSTNAME_ATTR, firstName);
        session.setAttribute(SESSION_TICKET_ATTR, ticket);
        return ResponseEntity.ok(Map.of("username", request.username(), "isAdmin", isAdmin, "firstName", firstName));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest httpRequest) {
        HttpSession session = httpRequest.getSession(false);
        if (session != null) {
            if (session.getAttribute(SESSION_TICKET_ATTR) instanceof String ticket) {
                try {
                    alfrescoAuthRestClient.delete()
                            .uri("/tickets/-me-")
                            .header(HttpHeaders.AUTHORIZATION, RestClientConfig.ticketAuthHeader(ticket))
                            .retrieve()
                            .toBodilessEntity();
                } catch (RuntimeException ignored) {
                    // best effort; the ticket expires on its own
                }
            }
            session.invalidate();
        }
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> me(HttpServletRequest httpRequest) {
        HttpSession session = httpRequest.getSession(false);
        Object username = session != null ? session.getAttribute(SESSION_USER_ATTR) : null;
        if (username == null || session.getAttribute(SESSION_TICKET_ATTR) == null) {
            return ResponseEntity.status(401).body(Map.of("message", "Not logged in"));
        }
        boolean isAdmin = Boolean.TRUE.equals(session.getAttribute(SESSION_ADMIN_ATTR));
        Object firstName = session.getAttribute(SESSION_FIRSTNAME_ATTR);
        return ResponseEntity.ok(Map.of("username", username, "isAdmin", isAdmin, "firstName", firstName != null ? firstName : username));
    }
}
