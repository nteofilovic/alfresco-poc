package ch.dmspoc.api.config;

import ch.dmspoc.api.controller.AuthController;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.web.servlet.HandlerInterceptor;

/** Blocks every /api/** call (other than /api/auth/**) until the session has a logged-in user. */
public class AuthInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws java.io.IOException {
        HttpSession session = request.getSession(false);
        if (session != null && session.getAttribute(AuthController.SESSION_USER_ATTR) != null) {
            return true;
        }
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write("{\"status\":401,\"message\":\"Not logged in\"}");
        return false;
    }
}
