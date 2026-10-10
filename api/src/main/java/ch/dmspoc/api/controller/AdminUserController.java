package ch.dmspoc.api.controller;

import ch.dmspoc.api.config.AlfrescoProperties;
import ch.dmspoc.api.dto.CreateUserRequest;
import ch.dmspoc.api.exception.AlfrescoApiException;
import ch.dmspoc.api.service.AlfrescoClient;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Admin-only user management; /api/admin/** is guarded by {@link ch.dmspoc.api.config.AdminInterceptor}. */
@RestController
public class AdminUserController {

    private final AlfrescoClient alfrescoClient;
    private final AlfrescoProperties props;

    public AdminUserController(AlfrescoClient alfrescoClient, AlfrescoProperties props) {
        this.alfrescoClient = alfrescoClient;
        this.props = props;
    }

    @GetMapping("/api/admin/users")
    public List<Map<String, Object>> listUsers(HttpSession session) {
        List<Map<String, Object>> users = new ArrayList<>();
        for (JsonNode item : alfrescoClient.listPeople().path("list").path("entries")) {
            String id = item.path("entry").path("id").asText();
            if (id.equals("guest")) continue; // built-in anonymous account, not a real user
            users.add(toUser(item.path("entry"), id.equals(session.getAttribute(AuthController.SESSION_USER_ATTR))
                    || id.equals(props.username())));
        }
        return users;
    }

    @PostMapping("/api/admin/users")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> createUser(@Valid @RequestBody CreateUserRequest request) {
        JsonNode entry = alfrescoClient
                .createPerson(request.username(), request.firstName(), request.lastName(), request.email(), request.password())
                .path("entry");
        return toUser(entry, false);
    }

    @PutMapping("/api/admin/users/{username}/enabled")
    public Map<String, Object> setEnabled(@PathVariable String username, @RequestBody Map<String, Boolean> body,
                                          HttpSession session) {
        boolean enabled = Boolean.TRUE.equals(body.get("enabled"));
        if (!enabled) guardProtected(username, session, "block");
        return toUser(alfrescoClient.setPersonEnabled(username, enabled).path("entry"), false);
    }

    @DeleteMapping("/api/admin/users/{username}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteUser(@PathVariable String username, HttpSession session) {
        guardProtected(username, session, "delete");
        alfrescoClient.deletePerson(username);
    }

    /** Stops an admin locking themselves (or the app's service account) out. */
    private void guardProtected(String username, HttpSession session, String verb) {
        if (username.equals(session.getAttribute(AuthController.SESSION_USER_ATTR)) || username.equals(props.username())) {
            throw new AlfrescoApiException(400, "You cannot " + verb + " this account");
        }
    }

    private static Map<String, Object> toUser(JsonNode entry, boolean isProtected) {
        Map<String, Object> user = new LinkedHashMap<>();
        user.put("username", entry.path("id").asText());
        user.put("firstName", entry.path("firstName").asText(""));
        user.put("lastName", entry.path("lastName").asText(""));
        user.put("email", entry.path("email").asText(""));
        user.put("enabled", entry.path("enabled").asBoolean(true));
        user.put("protectedAccount", isProtected);
        return user;
    }
}
