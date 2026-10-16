package ch.dmspoc.api.service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

import java.util.Optional;

/**
 * Small JSON documents the app keeps in Alfresco, in {@code Company Home/zapis-config/}, so its settings live
 * next to the content and survive API restarts. Always read and written with the service account.
 */
@Component
public class ConfigStore {

    private static final String CONFIG_FOLDER = "zapis-config";
    private static final String REPOSITORY_ROOT = "-root-";

    private final AlfrescoClient service;

    public ConfigStore(@Qualifier("serviceAlfrescoClient") AlfrescoClient service) {
        this.service = service;
    }

    /** The file's content; empty when the config folder or the file does not exist yet, or the file is empty. */
    public Optional<byte[]> read(String fileName) {
        String folderId = configFolderId(false);
        if (folderId == null) return Optional.empty();
        String fileId = configFileId(folderId, fileName);
        if (fileId == null) return Optional.empty();
        byte[] content = service.getContent(fileId);
        return content == null || content.length == 0 ? Optional.empty() : Optional.of(content);
    }

    /** Creates or overwrites the file (the config folder is created on first write). */
    public void write(String fileName, byte[] json) {
        service.uploadFile(configFolderId(true), fileName, json, "application/json", true);
    }

    private String configFolderId(boolean create) {
        for (JsonNode item : service.listChildren(REPOSITORY_ROOT, "(isFolder=true)", 0, 1000).path("list").path("entries")) {
            if (CONFIG_FOLDER.equals(item.path("entry").path("name").asText())) return item.path("entry").path("id").asText();
        }
        if (!create) return null;
        return service.createFolder(REPOSITORY_ROOT, CONFIG_FOLDER).path("entry").path("id").asText();
    }

    private String configFileId(String folderId, String fileName) {
        for (JsonNode item : service.listChildren(folderId, "(isFile=true)", 0, 100).path("list").path("entries")) {
            if (fileName.equals(item.path("entry").path("name").asText())) return item.path("entry").path("id").asText();
        }
        return null;
    }
}
