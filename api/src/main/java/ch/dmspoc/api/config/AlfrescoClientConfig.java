package ch.dmspoc.api.config;

import ch.dmspoc.api.service.AlfrescoClient;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

/**
 * Two {@link AlfrescoClient} instances. The primary one acts as the logged-in user (their ticket);
 * {@code serviceAlfrescoClient} acts as the shared service account and is only for operations a
 * regular user cannot do: creating sites and people, listing everyone, managing site members.
 */
@Configuration
public class AlfrescoClientConfig {

    @Bean
    @Primary
    public AlfrescoClient userAlfrescoClient(@Qualifier("userCoreRestClient") RestClient core,
                                             @Qualifier("userSearchRestClient") RestClient search,
                                             @Qualifier("alfrescoServiceRestClient") RestClient legacy,
                                             @Qualifier("userWorkflowRestClient") RestClient workflow,
                                             ObjectMapper mapper) {
        return new AlfrescoClient(core, search, legacy, workflow, mapper);
    }

    @Bean
    public AlfrescoClient serviceAlfrescoClient(@Qualifier("alfrescoRestClient") RestClient core,
                                                @Qualifier("alfrescoSearchRestClient") RestClient search,
                                                @Qualifier("alfrescoServiceRestClient") RestClient legacy,
                                                @Qualifier("alfrescoWorkflowRestClient") RestClient workflow,
                                                ObjectMapper mapper) {
        return new AlfrescoClient(core, search, legacy, workflow, mapper);
    }
}
