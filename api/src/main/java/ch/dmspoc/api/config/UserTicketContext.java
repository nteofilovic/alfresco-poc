package ch.dmspoc.api.config;

/**
 * The Alfresco ticket of the user whose request is being handled on the current thread. Set by
 * {@link AuthInterceptor} from the HTTP session, read by the per-user RestClients (see
 * {@link RestClientConfig}) so every content call reaches Alfresco as that user and Alfresco's own
 * ACLs decide what they may see.
 */
public final class UserTicketContext {

    private static final ThreadLocal<String> TICKET = new ThreadLocal<>();

    private UserTicketContext() {
    }

    public static void set(String ticket) {
        TICKET.set(ticket);
    }

    public static String get() {
        return TICKET.get();
    }

    public static void clear() {
        TICKET.remove();
    }
}
