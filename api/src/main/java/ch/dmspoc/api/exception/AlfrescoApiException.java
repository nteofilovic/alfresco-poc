package ch.dmspoc.api.exception;

/** Wraps a non-2xx response from Alfresco so controllers can translate it into a clean HTTP error for the front end. */
public class AlfrescoApiException extends RuntimeException {

    private final int status;

    public AlfrescoApiException(int status, String body) {
        super("Alfresco returned HTTP " + status + ": " + body);
        this.status = status;
    }

    public int getStatus() {
        return status;
    }
}
