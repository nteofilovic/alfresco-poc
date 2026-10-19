package ch.dmspoc.api.service;

import ch.dmspoc.api.dto.AnnotationInfo;
import ch.dmspoc.api.exception.RequestRejectedException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The save/read rules around the annotated copy; Alfresco and the store are mocked. */
class AnnotationsFlowTest {

    private final ObjectMapper mapper = JsonMapper.builder().build();
    private AlfrescoClient client;
    private AnnotationStore store;
    private AlfrescoService service;

    @BeforeEach
    void setUp() {
        client = mock(AlfrescoClient.class);
        store = mock(AnnotationStore.class);
        service = new AlfrescoService(client, mapper, mock(DocumentMergeService.class), mock(FolderTemplateService.class),
                new PdfAnnotationService(), store);
    }

    @Test
    void reportsNoAnnotationsWhenNothingStored() {
        node("1.0", true);
        when(store.meta("n1")).thenReturn(Optional.empty());
        AnnotationInfo info = service.getAnnotations("n1");
        assertFalse(info.exists());
        assertFalse(info.outdated());
    }

    @Test
    void marksAnnotationsOutdatedWhenTheOriginalHasANewVersion() {
        node("2.0", true);
        when(store.meta("n1")).thenReturn(Optional.of(new AnnotationStore.Meta("1.0", "ann", "t", 3)));
        AnnotationInfo info = service.getAnnotations("n1");
        assertTrue(info.exists());
        assertTrue(info.outdated());
        assertEquals(3, info.revision());
    }

    @Test
    void savesTheCopyWithoutTouchingTheOriginal() throws IOException {
        node("1.0", true);
        byte[] original = pdf(2);
        when(client.getContent("n1")).thenReturn(original);
        when(store.meta("n1")).thenReturn(Optional.empty());

        AnnotationInfo info = service.saveAnnotations("n1", pdf(2), List.of(), "ann", 0);

        assertEquals(1, info.revision());
        verify(store).save(eq("n1"), any(), eq(new AnnotationStore.Meta("1.0", "ann", info.updatedAt(), 1)));
        verify(client, never()).updateContent(any(), any(), any(), any());
    }

    @Test
    void refusesASaveBasedOnAStaleRevision() throws IOException {
        node("1.0", true);
        when(store.meta("n1")).thenReturn(Optional.of(new AnnotationStore.Meta("1.0", "other", "t", 4)));
        var e = assertThrows(RequestRejectedException.class, () -> service.saveAnnotations("n1", pdf(1), List.of(), "ann", 3));
        assertEquals(409, e.getStatus());
        verify(store, never()).save(any(), any(), any());
    }

    @Test
    void refusesUsersWhoCannotUpdateTheDocument() throws IOException {
        node("1.0", false);
        var e = assertThrows(RequestRejectedException.class, () -> service.saveAnnotations("n1", pdf(1), List.of(), "ann", 0));
        assertEquals(403, e.getStatus());
        var d = assertThrows(RequestRejectedException.class, () -> service.deleteAnnotations("n1"));
        assertEquals(403, d.getStatus());
        verify(store, never()).delete(any());
    }

    @Test
    void permanentDeleteRemovesTheAnnotationsButTrashKeepsThem() {
        service.deleteNode("n1", false);
        verify(store, never()).delete("n1");
        service.deleteNode("n1", true);
        verify(store).delete("n1");
    }

    private void node(String version, boolean updatable) {
        String json = "{\"entry\":{\"id\":\"n1\",\"name\":\"a.pdf\",\"content\":{\"mimeType\":\"application/pdf\"},"
                + "\"properties\":{\"cm:versionLabel\":\"" + version + "\"},"
                + "\"allowableOperations\":" + (updatable ? "[\"update\",\"delete\"]" : "[]") + "}}";
        when(client.getNode(eq("n1"), any())).thenReturn(mapper.readTree(json));
    }

    private static byte[] pdf(int pages) throws IOException {
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) doc.addPage(new PDPage());
            doc.save(out);
            return out.toByteArray();
        }
    }
}
