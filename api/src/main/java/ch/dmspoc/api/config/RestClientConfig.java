package ch.dmspoc.api.config;

import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.util.Timeout;
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

    /**
     * Unauthenticated client used only to validate a user-supplied username/password against
     * Alfresco at login time (each request adds its own Basic auth header). Kept separate from
     * {@link #alfrescoRestClient} so the app's own service-account credentials never mix with a
     * login attempt's credentials.
     */
    @Bean
    public RestClient alfrescoAuthProbeRestClient(AlfrescoProperties props) {
        var requestFactory = new HttpComponentsClientHttpRequestFactory(HttpClients.custom()
                .setConnectionManager(connectionManagerWithTimeout())
                .build());
        return RestClient.builder()
                .baseUrl(props.baseUrl() + "/alfresco/api/-default-/public/alfresco/versions/1")
                .requestFactory(requestFactory)
                .build();
    }

    private RestClient.Builder builder(AlfrescoProperties props) {
        String basicAuth = "Basic " + Base64.getEncoder().encodeToString(
                (props.username() + ":" + props.password()).getBytes(StandardCharsets.UTF_8));

        var requestFactory = new HttpComponentsClientHttpRequestFactory(HttpClients.custom()
                .setConnectionManager(connectionManagerWithTimeout())
                .build());

        return RestClient.builder()
                .defaultHeader("Authorization", basicAuth)
                .requestFactory(requestFactory);
    }

    /**
     * HttpComponentsClientHttpRequestFactory.setConnectTimeout(int) was removed in Spring
     * Framework 7 - the connect timeout is now configured on the Apache HttpClient's own
     * connection manager instead.
     */
    private static org.apache.hc.client5.http.io.HttpClientConnectionManager connectionManagerWithTimeout() {
        return PoolingHttpClientConnectionManagerBuilder.create()
                .setDefaultConnectionConfig(ConnectionConfig.custom()
                        .setConnectTimeout(Timeout.ofSeconds(10))
                        .build())
                .build();
    }
}
