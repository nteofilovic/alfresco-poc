package ch.dmspoc.api.config;

import ch.dmspoc.api.controller.AuthController;
import ch.dmspoc.api.service.WorkspaceService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;
import tools.jackson.databind.JsonNode;

import java.util.Map;
import java.util.Optional;

/**
 * Confines non-admin users to the workspace: every /api/nodes/{id}/** call must target a node
 * inside the workspace's document library. Non-admins also can't create or delete folders, nor
 * use the repository-wide endpoints (/recent, /root/children) - the folder structure is the admin's.
 * All calls reach Alfresco as the shared service account, so this is the only thing enforcing scope.
 */
public class WorkspaceScopeInterceptor implements HandlerInterceptor {

    private final WorkspaceService workspace;

    public WorkspaceScopeInterceptor(WorkspaceService workspace) {
        this.workspace = workspace;
    }

    @Override
    @SuppressWarnings("unchecked")
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws java.io.IOException {
        if (isAdmin(request)) return true;

        Map<String, String> vars = (Map<String, String>) request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        String nodeId = vars == null ? null : vars.getOrDefault("nodeId", vars.get("parentId"));
        if (nodeId == null) return deny(response, "Not available");

        Optional<JsonNode> node = workspace.findInWorkspace(nodeId);
        if (node.isEmpty()) return deny(response, "Outside the workspace");

        String method = request.getMethod();
        boolean createsFolder = "POST".equals(method) && request.getRequestURI().endsWith("/folders");
        boolean isFolder = node.get().path("isFolder").asBoolean(false);
        boolean deletesFolder = "DELETE".equals(method) && isFolder;
        String uri = request.getRequestURI();
        boolean movesFolder = "POST".equals(method) && isFolder && (uri.endsWith("/move") || uri.endsWith("/copy"));
        boolean renamesFolder = "PUT".equals(method) && isFolder && uri.endsWith("/name");
        if (createsFolder || deletesFolder || movesFolder || renamesFolder) return deny(response, "Only administrators can change the folder structure");
        return true;
    }

    private static boolean isAdmin(HttpServletRequest request) {
        var session = request.getSession(false);
        return session != null && Boolean.TRUE.equals(session.getAttribute(AuthController.SESSION_ADMIN_ATTR));
    }

    private static boolean deny(HttpServletResponse response, String message) throws java.io.IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");
        response.getWriter().write("{\"status\":403,\"message\":\"" + message + "\"}");
        return false;
    }
}
