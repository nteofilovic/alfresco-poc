package ch.dmspoc.api.config;

import ch.dmspoc.api.controller.AuthController;
import ch.dmspoc.api.service.AlfrescoClient;
import ch.dmspoc.api.service.FolderTemplateService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;
import tools.jackson.databind.JsonNode;

import java.util.Map;

/**
 * Extra rules for non-admins on /api/nodes/**. Who may read or write a node is decided by Alfresco
 * (calls carry the user's own ticket), so this only adds what ACLs don't express: the folder
 * structure of a space belongs to the admin: members cannot create plain folders (they create them from
 * folder templates instead) or delete, rename, move or copy folders, except the top folder of something
 * they created from a template; and the repository-wide endpoints (/recent, /root/children) and Alfresco aliases such
 * as -my- or -root- are admin-only, so users only reach content through their spaces.
 */
public class WorkspaceScopeInterceptor implements HandlerInterceptor {

    private final AlfrescoClient client;

    public WorkspaceScopeInterceptor(AlfrescoClient client) {
        this.client = client;
    }

    @Override
    @SuppressWarnings("unchecked")
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws java.io.IOException {
        if (isAdmin(request)) return true;

        Map<String, String> vars = (Map<String, String>) request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        String nodeId = vars == null ? null : vars.getOrDefault("nodeId", vars.get("parentId"));
        if (nodeId == null || nodeId.startsWith("-")) return deny(response, "Not available");

        String method = request.getMethod();
        String uri = request.getRequestURI();
        if ("POST".equals(method) && uri.endsWith("/folders")) return deny(response, FOLDERS_ADMIN_ONLY);

        boolean mayTouchFolder = "DELETE".equals(method)
                || ("POST".equals(method) && (uri.endsWith("/move") || uri.endsWith("/copy")))
                || ("PUT".equals(method) && uri.endsWith("/name"));
        if (mayTouchFolder) {
            // Fetched with the user's ticket: a node they can't see fails here with Alfresco's 403/404.
            JsonNode node = client.getNode(nodeId, "properties").path("entry");
            // A folder members created from a template (a Client, Property...) is theirs to rename, move
            // or delete; its fixed subfolders and anything an admin designed are not.
            boolean memberFolder = node.path("properties").path("cm:description").asText("")
                    .startsWith(FolderTemplateService.TEMPLATE_MARK);
            if (node.path("isFolder").asBoolean(false) && !memberFolder) return deny(response, FOLDERS_ADMIN_ONLY);
        }
        return true;
    }

    private static final String FOLDERS_ADMIN_ONLY = "Only administrators can change the folder structure";

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
