package ch.dmspoc.api.service;

import ch.dmspoc.api.dto.FolderNode;
import ch.dmspoc.api.dto.FolderTemplateDto;
import ch.dmspoc.api.dto.FolderTemplateRequest;
import ch.dmspoc.api.exception.AlfrescoApiException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Admin-designed folder templates (Client, Property, Owner...). They are kept as one small JSON document,
 * {@code Company Home/zapis-config/folder-templates.json}, so they live in Alfresco next to the content
 * and survive API restarts. Reading and writing that document uses the service account; creating folders
 * from a template is done by {@link AlfrescoService} with the member's own ticket.
 */
@Service
public class FolderTemplateService {

    private static final String CONFIG_FOLDER = "zapis-config";
    private static final String CONFIG_FILE = "folder-templates.json";
    private static final String REPOSITORY_ROOT = "-root-";

    /**
     * cm:description prefix on the top folder created from a template; members may rename, move and delete
     * such folders, unlike the fixed subfolders (marked {@link SpaceService#STRUCTURE_MARK}).
     */
    public static final String TEMPLATE_MARK = "zapis-template:";

    private static final TypeReference<List<FolderTemplateDto>> LIST_TYPE = new TypeReference<>() {
    };

    private final AlfrescoClient service;
    private final ObjectMapper mapper;

    public FolderTemplateService(@Qualifier("serviceAlfrescoClient") AlfrescoClient service, ObjectMapper mapper) {
        this.service = service;
        this.mapper = mapper;
    }

    public synchronized List<FolderTemplateDto> list() {
        return read();
    }

    public synchronized Optional<FolderTemplateDto> find(String id) {
        return read().stream().filter(t -> t.id().equals(id)).findFirst();
    }

    public synchronized FolderTemplateDto create(FolderTemplateRequest request) {
        List<FolderTemplateDto> all = new ArrayList<>(read());
        FolderTemplateDto template = validated(UUID.randomUUID().toString(), request, all);
        all.add(template);
        write(all);
        return template;
    }

    public synchronized FolderTemplateDto update(String id, FolderTemplateRequest request) {
        List<FolderTemplateDto> all = new ArrayList<>(read());
        int at = indexOf(all, id);
        FolderTemplateDto template = validated(id, request, all);
        all.set(at, template);
        write(all);
        return template;
    }

    public synchronized void delete(String id) {
        List<FolderTemplateDto> all = new ArrayList<>(read());
        all.remove(indexOf(all, id));
        write(all);
    }

    // ---------------------------------------------------------------- helpers

    private static int indexOf(List<FolderTemplateDto> all, String id) {
        for (int i = 0; i < all.size(); i++) {
            if (all.get(i).id().equals(id)) return i;
        }
        throw new AlfrescoApiException(404, "Folder template not found");
    }

    /** Normalizes the request into a template; the name must be unique among the other templates. */
    private static FolderTemplateDto validated(String id, FolderTemplateRequest request, List<FolderTemplateDto> others) {
        String name = request.name().trim();
        for (FolderTemplateDto other : others) {
            if (!other.id().equals(id) && other.name().equalsIgnoreCase(name)) {
                throw new AlfrescoApiException(409, "A folder template named “" + name + "” already exists");
            }
        }
        assertNoDuplicateSiblings(request.folders());
        String description = request.description() == null ? "" : request.description().trim();
        return new FolderTemplateDto(id, name, description, normalize(request.folders()));
    }

    private static List<FolderNode> normalize(List<FolderNode> folders) {
        if (folders == null) return List.of();
        return folders.stream().map(f -> new FolderNode(f.name().trim(), normalize(f.children()))).toList();
    }

    private static void assertNoDuplicateSiblings(List<FolderNode> folders) {
        if (folders == null) return;
        Set<String> seen = new HashSet<>();
        for (FolderNode folder : folders) {
            if (!seen.add(folder.name().trim().toLowerCase())) {
                throw new AlfrescoApiException(400, "Duplicate folder name: " + folder.name().trim());
            }
            assertNoDuplicateSiblings(folder.children());
        }
    }

    private List<FolderTemplateDto> read() {
        String folderId = configFolderId(false);
        if (folderId == null) return List.of();
        String fileId = configFileId(folderId);
        if (fileId == null) return List.of();
        byte[] content = service.getContent(fileId);
        if (content == null || content.length == 0) return List.of();
        return mapper.readValue(content, LIST_TYPE);
    }

    private void write(List<FolderTemplateDto> templates) {
        String folderId = configFolderId(true);
        service.uploadFile(folderId, CONFIG_FILE, mapper.writeValueAsBytes(templates), "application/json", true);
    }

    /** The config folder under Company Home; created on first write. */
    private String configFolderId(boolean create) {
        for (JsonNode item : service.listChildren(REPOSITORY_ROOT, "(isFolder=true)", 0, 1000).path("list").path("entries")) {
            if (CONFIG_FOLDER.equals(item.path("entry").path("name").asText())) return item.path("entry").path("id").asText();
        }
        if (!create) return null;
        return service.createFolder(REPOSITORY_ROOT, CONFIG_FOLDER).path("entry").path("id").asText();
    }

    private String configFileId(String folderId) {
        for (JsonNode item : service.listChildren(folderId, "(isFile=true)", 0, 100).path("list").path("entries")) {
            if (CONFIG_FILE.equals(item.path("entry").path("name").asText())) return item.path("entry").path("id").asText();
        }
        return null;
    }
}
