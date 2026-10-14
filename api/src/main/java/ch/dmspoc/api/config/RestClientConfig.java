package ch.dmspoc.api.config;

import ch.dmspoc.api.exception.AlfrescoApiException;
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
 * Two families of RestClients against the same Alfresco instance (see AlfrescoClientConfig):
 * <ul>
 *   <li>service clients, pre-authenticated with the shared service account, for admin-only
 *       operations (sites, people) and for the workflow engine;</li>
 *   <li>user clients, authenticated per request with the logged-in user's ticket, for everything
 *       that touches content, so Alfresco's ACLs apply to the real user.</li>
 * </ul>
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

    /** Workflow REST API (embedded Activiti): processes, tasks, items, variables. Backs the daily task list. */
    @Bean
    public RestClient alfrescoWorkflowRestClient(AlfrescoProperties props) {
        return builder(props).baseUrl(props.baseUrl() + "/alfresco/api/-default-/public/workflow/versions/1").build();
    }

    /** Legacy webscript root; only used for operations the public REST API lacks (deleting a person). */
    @Bean
    public RestClient alfrescoServiceRestClient(AlfrescoProperties props) {
        return builder(props).baseUrl(props.baseUrl() + "/alfresco/service").build();
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

    // ---- per-user clients: same Alfresco APIs, but authenticated with the logged-in user's ticket

    @Bean
    public RestClient userCoreRestClient(AlfrescoProperties props) {
        return userBuilder().baseUrl(props.baseUrl() + "/alfresco/api/-default-/public/alfresco/versions/1").build();
    }

    @Bean
    public RestClient userSearchRestClient(AlfrescoProperties props) {
        return userBuilder().baseUrl(props.baseUrl() + "/alfresco/api/-default-/public/search/versions/1").build();
    }

    @Bean
    public RestClient userWorkflowRestClient(AlfrescoProperties props) {
        return userBuilder().baseUrl(props.baseUrl() + "/alfresco/api/-default-/public/workflow/versions/1").build();
    }

    /** Authentication API: issues and revokes login tickets. Callers supply their own credentials. */
    @Bean
    public RestClient alfrescoAuthRestClient(AlfrescoProperties props) {
        var requestFactory = new HttpComponentsClientHttpRequestFactory(HttpClients.custom()
                .setConnectionManager(connectionManagerWithTimeout())
                .build());
        return RestClient.builder()
                .baseUrl(props.baseUrl() + "/alfresco/api/-default-/public/authentication/versions/1")
                .requestFactory(requestFactory)
                .build();
    }

    /** Alfresco accepts a ticket as the password of the pseudo-user ROLE_TICKET. */
    public static String ticketAuthHeader(String ticket) {
        return "Basic " + Base64.getEncoder().encodeToString(("ROLE_TICKET:" + ticket).getBytes(StandardCharsets.UTF_8));
    }

    private RestClient.Builder userBuilder() {
        var requestFactory = new HttpComponentsClientHttpRequestFactory(HttpClients.custom()
                .setConnectionManager(connectionManagerWithTimeout())
                .build());
        return RestClient.builder()
                .requestFactory(requestFactory)
                .requestInterceptor((request, body, execution) -> {
                    String ticket = UserTicketContext.get();
                    if (ticket == null) throw new AlfrescoApiException(401, "No user ticket for this request");
                    request.getHeaders().set("Authorization", ticketAuthHeader(ticket));
                    return execution.execute(request, body);
                });
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
