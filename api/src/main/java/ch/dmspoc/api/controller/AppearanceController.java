package ch.dmspoc.api.controller;

import ch.dmspoc.api.dto.AppearanceDto;
import ch.dmspoc.api.dto.AppearanceSettings;
import ch.dmspoc.api.dto.UserStyleRequest;
import ch.dmspoc.api.service.AppearanceService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * App style (layout) of the web app. Any logged-in user reads their effective style and may set their own when the
 * administrator allows it; the user is always taken from the session. The default and the user-choice switch are
 * admin only ({@link ch.dmspoc.api.config.AdminInterceptor} guards /api/admin/**).
 */
@RestController
public class AppearanceController {

    private final AppearanceService appearance;

    public AppearanceController(AppearanceService appearance) {
        this.appearance = appearance;
    }

    @GetMapping("/api/appearance")
    public AppearanceDto get(HttpSession session) {
        return appearance.forUser(currentUser(session));
    }

    @PutMapping("/api/appearance/me")
    public AppearanceDto setOwn(@RequestBody UserStyleRequest request, HttpSession session) {
        return appearance.setUserStyle(currentUser(session), request.style());
    }

    @GetMapping("/api/admin/appearance")
    public AppearanceSettings settings() {
        return appearance.settings();
    }

    @PutMapping("/api/admin/appearance")
    public AppearanceSettings updateSettings(@Valid @RequestBody AppearanceSettings settings) {
        return appearance.updateSettings(settings);
    }

    private static String currentUser(HttpSession session) {
        return (String) session.getAttribute(AuthController.SESSION_USER_ATTR);
    }
}
