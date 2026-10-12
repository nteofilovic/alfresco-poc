package ch.dmspoc.api.service;

import ch.dmspoc.api.dto.FolderNode;
import ch.dmspoc.api.exception.AlfrescoApiException;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * The one "Workspace" Share site whose document library holds the folder structure an admin
 * designed. End users are confined to it (see WorkspaceScopeInterceptor).
 */
@Service
public class WorkspaceService {

    public static final String SITE_ID = "zapis-workspace";
    public static final String TITLE = "Workspace";
    /** cm:description value on folders created from the Administration page; they can't be renamed. */
    public static final String STRUCTURE_MARK = "zapis-structure";

    private final AlfrescoClient client;

    public WorkspaceService(AlfrescoClient client) {
        this.client = client;
    }

    /** Node id of the workspace's document library, or empty if the admin hasn't created it yet. */
    public Optional<String> rootId() {
        try {
            String id = client.getSiteContainer(SITE_ID, "documentLibrary").path("entry").path("id").asText("");
            return id.isEmpty() ? Optional.empty() : Optional.of(id);
        } catch (AlfrescoApiException e) {
            if (e.getStatus() == 404) return Optional.empty();
            throw e;
        }
    }

    /** Creates the site and the whole folder tree under its document library; rolls the site back on failure. */
    public String create(List<FolderNode> folders) {
        if (rootId().isPresent()) {
            throw new AlfrescoApiException(409, "The workspace has already been created");
        }
        assertNoDuplicateSiblings(folders);
        client.createSite(SITE_ID, TITLE, "Zapis workspace", "PUBLIC");
        try {
            String root = client.getSiteContainer(SITE_ID, "documentLibrary").path("entry").path("id").asText();
            createChildren(root, folders);
            return root;
        } catch (RuntimeException e) {
            try {
                client.deleteSite(SITE_ID);
            } catch (RuntimeException ignored) {
                // best effort; the original error is the useful one
            }
            throw e;
        }
    }

    /**
     * Whether {@code nodeId} is the workspace root or sits below it. Returns the node entry (with
     * {@code isFolder}) when it does, empty otherwise.
     */
    public Optional<JsonNode> findInWorkspace(String nodeId) {
        Optional<String> root = rootId();
        if (root.isEmpty()) return Optional.empty();
        JsonNode node;
        try {
            node = client.getNode(nodeId, "path").path("entry");
        } catch (AlfrescoApiException e) {
            if (e.getStatus() == 404 || e.getStatus() == 400) return Optional.empty();
            throw e;
        }
        if (root.get().equals(node.path("id").asText())) return Optional.of(node);
        for (JsonNode element : node.path("path").path("elements")) {
            if (root.get().equals(element.path("id").asText())) return Optional.of(node);
        }
        return Optional.empty();
    }

    public boolean isRoot(String nodeId) {
        return rootId().map(r -> r.equals(nodeId)).orElse(false);
    }

    private void createChildren(String parentId, List<FolderNode> folders) {
        if (folders == null) return;
        for (FolderNode folder : folders) {
            String id = client.createFolder(parentId, folder.name().trim(), STRUCTURE_MARK).path("entry").path("id").asText();
            createChildren(id, folder.children());
        }
    }

    private void assertNoDuplicateSiblings(List<FolderNode> folders) {
        if (folders == null) return;
        Set<String> seen = new HashSet<>();
        for (FolderNode folder : folders) {
            if (!seen.add(folder.name().trim().toLowerCase())) {
                throw new AlfrescoApiException(400, "Duplicate folder name: " + folder.name().trim());
            }
            assertNoDuplicateSiblings(folder.children());
        }
    }
}
