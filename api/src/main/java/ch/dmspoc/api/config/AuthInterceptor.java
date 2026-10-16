package ch.dmspoc.api.config;

import ch.dmspoc.api.controller.AuthController;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Blocks every /api/** call (other than /api/auth/**) until the session has a logged-in user, and
 * exposes that user's Alfresco ticket to the per-user RestClients for the duration of the request.
 */
public class AuthInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws java.io.IOException {
        HttpSession session = request.getSession(false);
        if (session != null && session.getAttribute(AuthController.SESSION_USER_ATTR) != null
                && session.getAttribute(AuthController.SESSION_TICKET_ATTR) instanceof String ticket) {
            UserTicketContext.set(ticket);
            return true;
        }
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write("{\"status\":401,\"message\":\"Not logged in\"}");
        return false;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        UserTicketContext.clear();
    }
}
