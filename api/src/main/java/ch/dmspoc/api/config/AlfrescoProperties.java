package ch.dmspoc.api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "alfresco")
public record AlfrescoProperties(
        String baseUrl,
        String username,
        String password,
        String defaultParentId
) {
}
