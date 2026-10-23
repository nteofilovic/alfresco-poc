package ch.dmspoc.api.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AnnotationStoreTest {

    private final ObjectMapper mapper = JsonMapper.builder().build();
    private ConfigStore config;
    private AnnotationStore store;

    @BeforeEach
    void setUp() {
        config = mock(ConfigStore.class);
        store = new AnnotationStore(config, mapper);
    }

    @Test
    void metaIsEmptyWhenNothingIsStored() {
        when(config.read("annotations", "n1.json")).thenReturn(Optional.empty());

        assertEquals(Optional.empty(), store.meta("n1"));
    }

    @Test
    void metaIsReadFromTheJsonSidecar() {
        String json = "{\"baseVersion\":\"1.0\",\"updatedBy\":\"anna\",\"updatedAt\":\"2026-01-01T00:00:00Z\",\"revision\":4}";
        when(config.read("annotations", "n1.json")).thenReturn(Optional.of(json.getBytes()));

        assertEquals(new AnnotationStore.Meta("1.0", "anna", "2026-01-01T00:00:00Z", 4), store.meta("n1").orElseThrow());
    }

    @Test
    void metaWithoutABaseVersionIsStillReadable() {
        when(config.read("annotations", "n1.json"))
                .thenReturn(Optional.of("{\"updatedBy\":\"anna\",\"revision\":1}".getBytes()));

        var meta = store.meta("n1").orElseThrow();
        assertEquals(null, meta.baseVersion());
        assertEquals(1, meta.revision());
    }

    @Test
    void damagedMetaIsReportedNotSwallowed() {
        when(config.read("annotations", "n1.json")).thenReturn(Optional.of("not json".getBytes()));

        assertThrows(JacksonException.class, () -> store.meta("n1"));
    }

    @Test
    void pdfIsReadFromTheSidecar() {
        when(config.read("annotations", "n1.pdf")).thenReturn(Optional.of("%PDF".getBytes()));
        when(config.read("annotations", "n2.pdf")).thenReturn(Optional.empty());

        assertArrayEquals("%PDF".getBytes(), store.pdf("n1").orElseThrow());
        assertEquals(Optional.empty(), store.pdf("n2"));
    }

    @Test
    void savingWritesThePdfBeforeTheMetadata() {
        var meta = new AnnotationStore.Meta("1.0", "anna", "t", 1);

        store.save("n1", "pdf".getBytes(), meta);

        InOrder order = inOrder(config);
        order.verify(config).write("annotations", "n1.pdf", "pdf".getBytes(), "application/pdf");
        ArgumentCaptor<byte[]> json = ArgumentCaptor.forClass(byte[].class);
        order.verify(config).write(eq("annotations"), eq("n1.json"), json.capture(), eq("application/json"));
        assertEquals(meta, mapper.readValue(json.getValue(), AnnotationStore.Meta.class));
    }

    @Test
    void aFailedPdfWriteLeavesTheMetadataUntouched() {
        doThrowOnPdfWrite();

        assertThrows(IllegalStateException.class, () -> store.save("n1", "pdf".getBytes(), new AnnotationStore.Meta("1.0", "a", "t", 1)));

        verify(config, times(0)).write(eq("annotations"), eq("n1.json"), any(), any());
    }

    @Test
    void deleteRemovesBothFiles() {
        store.delete("n1");

        verify(config).delete("annotations", "n1.json");
        verify(config).delete("annotations", "n1.pdf");
    }

    // ------------------------------------------------------------ annotatedIds

    @Test
    void annotatedIdsAreTheJsonSidecarsWithoutTheirExtension() {
        when(config.listNames("annotations")).thenReturn(Set.of("n1.json", "n1.pdf", "n2.json", "readme.txt"));

        assertEquals(Set.of("n1", "n2"), store.annotatedIds());
    }

    @Test
    void annotatedIdsAreEmptyWithoutAnnotations() {
        when(config.listNames("annotations")).thenReturn(Set.of());

        assertTrue(store.annotatedIds().isEmpty());
    }

    @Test
    void annotatedIdsAreCachedForAFewSeconds() {
        when(config.listNames("annotations")).thenReturn(Set.of("n1.json"));

        store.annotatedIds();
        store.annotatedIds();

        verify(config, times(1)).listNames("annotations");
    }

    @Test
    void savingDropsTheCachedIds() {
        when(config.listNames("annotations")).thenReturn(Set.of("n1.json"));
        assertEquals(Set.of("n1"), store.annotatedIds());

        when(config.listNames("annotations")).thenReturn(Set.of("n1.json", "n2.json"));
        store.save("n2", "pdf".getBytes(), new AnnotationStore.Meta("1.0", "a", "t", 1));

        assertEquals(Set.of("n1", "n2"), store.annotatedIds());
    }

    @Test
    void deletingDropsTheCachedIds() {
        when(config.listNames("annotations")).thenReturn(Set.of("n1.json"));
        assertEquals(Set.of("n1"), store.annotatedIds());

        when(config.listNames("annotations")).thenReturn(Set.of());
        store.delete("n1");

        assertTrue(store.annotatedIds().isEmpty());
    }

    private void doThrowOnPdfWrite() {
        org.mockito.Mockito.doThrow(new IllegalStateException("down"))
                .when(config).write(eq("annotations"), eq("n1.pdf"), any(), any());
    }
}
