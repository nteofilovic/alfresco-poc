package ch.dmspoc.api.exception;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(AlfrescoApiException.class)
    public ResponseEntity<Map<String, Object>> handleAlfresco(AlfrescoApiException e, HttpServletRequest request) {
        if (e.getStatus() == 401) {
            // The user's Alfresco ticket expired or was revoked: end the session so the SPA shows the login.
            HttpSession session = request.getSession(false);
            if (session != null) session.invalidate();
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(errorBody(401, "Session expired, please sign in again"));
        }
        HttpStatus status = HttpStatus.resolve(e.getStatus());
        HttpStatus resolved = status != null ? status : HttpStatus.BAD_GATEWAY;
        return ResponseEntity.status(resolved).body(errorBody(resolved.value(), e.getMessage()));
    }

    @ExceptionHandler(RequestRejectedException.class)
    public ResponseEntity<Map<String, Object>> handleRejected(RequestRejectedException e) {
        return ResponseEntity.status(e.getStatus()).body(errorBody(e.getStatus(), e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException e) {
        String detail = e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getField() + ": " + f.getDefaultMessage())
                .reduce((a, b) -> a + "; " + b)
                .orElse("Invalid request");
        return ResponseEntity.badRequest().body(errorBody(400, detail));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneric(Exception e) {
        log.error("Unhandled error", e);
        return ResponseEntity.internalServerError().body(errorBody(500, e.getMessage()));
    }

    private Map<String, Object> errorBody(int status, String message) {
        return Map.of(
                "timestamp", Instant.now().toString(),
                "status", status,
                "message", message != null ? message : "Unexpected error"
        );
    }
}
