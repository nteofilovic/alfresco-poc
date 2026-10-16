package ch.dmspoc.api.config;

import ch.dmspoc.api.service.AlfrescoClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CorsConfig {

    @Bean
    public WebMvcConfigurer corsConfigurer(
            @org.springframework.beans.factory.annotation.Value("${app.cors.allowed-origins}") String allowedOrigins,
            AlfrescoClient userAlfrescoClient) {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/**")
                        .allowedOrigins(allowedOrigins.split(","))
                        .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                        .allowedHeaders("*")
                        // The session cookie set on login must be sent back on later /api/** calls.
                        .allowCredentials(true);
            }

            @Override
            public void addInterceptors(org.springframework.web.servlet.config.annotation.InterceptorRegistry registry) {
                // Order matters: AuthInterceptor puts the user's ticket in place for the ones after it.
                registry.addInterceptor(new AuthInterceptor())
                        .addPathPatterns("/api/**")
                        .excludePathPatterns("/api/auth/**");
                registry.addInterceptor(new WorkspaceScopeInterceptor(userAlfrescoClient))
                        .addPathPatterns("/api/nodes/**");
                registry.addInterceptor(new AdminInterceptor())
                        .addPathPatterns("/api/admin/**");
            }
        };
    }
}
