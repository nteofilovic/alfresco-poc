package ch.dmspoc.api.service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

import java.util.HashSet;
import java.util.Optional;
import java.util.Set;

/**
 * Small documents the app keeps in Alfresco, in {@code Company Home/zapis-config/}, so its settings live
 * next to the content and survive API restarts. Always read and written with the service account.
 * Settings are JSON files directly in the folder; bulkier per-document data (annotations) goes in a subfolder.
 */
@Component
public class ConfigStore {

    private static final String CONFIG_FOLDER = "zapis-config";
    private static final String REPOSITORY_ROOT = "-root-";
    private static final String JSON = "application/json";

    private final AlfrescoClient service;

    public ConfigStore(@Qualifier("serviceAlfrescoClient") AlfrescoClient service) {
        this.service = service;
    }

    /** The file's content; empty when the config folder or the file does not exist yet, or the file is empty. */
    public Optional<byte[]> read(String fileName) {
        return read(null, fileName);
    }

    /** Creates or overwrites the file (the config folder is created on first write). */
    public void write(String fileName, byte[] json) {
        write(null, fileName, json, JSON);
    }

    /** Like {@link #read(String)} for a file in {@code subFolder} of the config folder (null = the folder itself). */
    public Optional<byte[]> read(String subFolder, String fileName) {
        String fileId = fileId(subFolder, fileName);
        if (fileId == null) return Optional.empty();
        byte[] content = service.getContent(fileId);
        return content == null || content.length == 0 ? Optional.empty() : Optional.of(content);
    }

    /** Creates or overwrites a file in {@code subFolder} (null = the config folder itself); folders are created as needed. */
    public void write(String subFolder, String fileName, byte[] content, String contentType) {
        service.uploadFile(folderId(subFolder, true), fileName, content, contentType, true);
    }

    /** Names of all files in {@code subFolder} (one listing, however many there are); empty when it does not exist. */
    public Set<String> listNames(String subFolder) {
        Set<String> names = new HashSet<>();
        String folderId = folderId(subFolder, false);
        if (folderId == null) return names;
        int skip = 0;
        while (true) {
            JsonNode list = service.listChildren(folderId, "(isFile=true)", skip, 1000).path("list");
            for (JsonNode item : list.path("entries")) names.add(item.path("entry").path("name").asText());
            if (!list.path("pagination").path("hasMoreItems").asBoolean(false)) return names;
            skip += 1000;
        }
    }

    /** Removes the file if it exists. */
    public void delete(String subFolder, String fileName) {
        String fileId = fileId(subFolder, fileName);
        if (fileId != null) service.deleteNode(fileId, true);
    }

    private String fileId(String subFolder, String fileName) {
        String folderId = folderId(subFolder, false);
        if (folderId == null) return null;
        JsonNode file = service.findByRelativePath(folderId, fileName);
        return file == null || !file.path("isFile").asBoolean(false) ? null : file.path("id").asText();
    }

    private String folderId(String subFolder, boolean create) {
        String id = childFolderId(REPOSITORY_ROOT, CONFIG_FOLDER, create);
        return id == null || subFolder == null ? id : childFolderId(id, subFolder, create);
    }

    private String childFolderId(String parentId, String name, boolean create) {
        JsonNode folder = service.findByRelativePath(parentId, name);
        if (folder != null && folder.path("isFolder").asBoolean(false)) return folder.path("id").asText();
        if (!create) return null;
        return service.createFolder(parentId, name).path("entry").path("id").asText();
    }
}
