package ch.dmspoc.api.exception;

/** A request the API itself refuses (bad input, stale version); the message is shown to the user as-is. */
public class RequestRejectedException extends RuntimeException {

    private final int status;

    public RequestRejectedException(int status, String message) {
        super(message);
        this.status = status;
    }

    public int getStatus() {
        return status;
    }
}
