package ch.dmspoc.api.config;

import ch.dmspoc.api.controller.AuthController;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AuthInterceptorTest {

    private final AuthInterceptor interceptor = new AuthInterceptor();

    @AfterEach
    void cleanUp() {
        UserTicketContext.clear();
    }

    @Test
    void rejectsRequestWithoutSession() throws Exception {
        var response = new MockHttpServletResponse();
        assertFalse(interceptor.preHandle(new MockHttpServletRequest(), response, null));
        assertEquals(401, response.getStatus());
        assertNull(UserTicketContext.get());
    }

    @Test
    void rejectsSessionWithoutTicket() throws Exception {
        var request = new MockHttpServletRequest();
        var session = new MockHttpSession();
        session.setAttribute(AuthController.SESSION_USER_ATTR, "anna");
        request.setSession(session);
        var response = new MockHttpServletResponse();
        assertFalse(interceptor.preHandle(request, response, null));
        assertEquals(401, response.getStatus());
    }

    @Test
    void exposesTicketDuringRequestAndClearsItAfterwards() throws Exception {
        var request = new MockHttpServletRequest();
        var session = new MockHttpSession();
        session.setAttribute(AuthController.SESSION_USER_ATTR, "anna");
        session.setAttribute(AuthController.SESSION_TICKET_ATTR, "TICKET_abc");
        request.setSession(session);

        assertTrue(interceptor.preHandle(request, new MockHttpServletResponse(), null));
        assertEquals("TICKET_abc", UserTicketContext.get());

        interceptor.afterCompletion(request, new MockHttpServletResponse(), null, null);
        assertNull(UserTicketContext.get());
    }

    @Test
    void ticketIsSentAsBasicAuthOfRoleTicket() {
        String header = RestClientConfig.ticketAuthHeader("TICKET_abc");
        String decoded = new String(java.util.Base64.getDecoder().decode(header.substring("Basic ".length())));
        assertEquals("ROLE_TICKET:TICKET_abc", decoded);
    }
}
