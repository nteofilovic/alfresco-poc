package ch.dmspoc.api.config;

import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Two RestClients, both pre-authenticated with HTTP Basic auth against the
 * same Alfresco instance, but pointed at its two separate REST API roots:
 * the Core API (nodes, sites, renditions...) and the Search API.
 * Everything the app knows about the Alfresco content store goes through
 * these two beans (see AlfrescoClient).
 */
@Configuration
public class RestClientConfig {

    @Bean
    public RestClient alfrescoRestClient(AlfrescoProperties props) {
        return builder(props).baseUrl(props.baseUrl() + "/alfresco/api/-default-/public/alfresco/versions/1").build();
    }

    @Bean
    public RestClient alfrescoSearchRestClient(AlfrescoProperties props) {
        return builder(props).baseUrl(props.baseUrl() + "/alfresco/api/-default-/public/search/versions/1").build();
    }

    private RestClient.Builder builder(AlfrescoProperties props) {
        String basicAuth = "Basic " + Base64.getEncoder().encodeToString(
                (props.username() + ":" + props.password()).getBytes(StandardCharsets.UTF_8));

        var requestFactory = new HttpComponentsClientHttpRequestFactory(HttpClients.createDefault());
        requestFactory.setConnectTimeout(10_000);

        return RestClient.builder()
                .defaultHeader("Authorization", basicAuth)
                .requestFactory(requestFactory);
    }
}
