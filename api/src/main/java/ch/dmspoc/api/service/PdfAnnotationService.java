package ch.dmspoc.api.service;

import ch.dmspoc.api.dto.StickyNote;
import ch.dmspoc.api.exception.RequestRejectedException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.color.PDColor;
import org.apache.pdfbox.pdmodel.graphics.color.PDDeviceRGB;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationText;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Calendar;
import java.util.List;

/**
 * Guards the "save annotated PDF" write path. The browser produces the annotated bytes (highlights, text and
 * drawings are stored in the PDF as standard annotation objects, so other PDF clients show them); sticky notes
 * are added here, as standard Text annotations. The API also checks the result is still the same document
 * before it stores the annotated copy (the original is never modified, so signed PDFs are fine).
 */
@Service
public class PdfAnnotationService {

    private static final float NOTE_SIZE = 20f;
    /** Print + NoZoom + NoRotate: the note icon keeps its size on screen, like Acrobat's own notes. */
    private static final int NOTE_FLAGS = 4 | 8 | 16;

    /**
     * @param original content currently stored in Alfresco
     * @param edited   bytes sent by the client
     * @throws RequestRejectedException when the annotated copy must not be stored
     */
    public void validate(byte[] original, byte[] edited) {
        try (PDDocument before = Loader.loadPDF(original)) {
            try (PDDocument after = Loader.loadPDF(edited)) {
                if (after.getNumberOfPages() != before.getNumberOfPages()) {
                    throw new RequestRejectedException(422, "The annotated file has a different number of pages than the original.");
                }
            }
        } catch (IOException e) {
            throw new RequestRejectedException(422, "The file is not a PDF that can be annotated (it may be encrypted or damaged).");
        }
    }

    /** Returns {@code pdf} with the notes added as Text annotations authored by {@code author}. */
    public byte[] addNotes(byte[] pdf, List<StickyNote> notes, String author) {
        if (notes == null || notes.isEmpty()) return pdf;
        try (PDDocument doc = Loader.loadPDF(pdf); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (StickyNote note : notes) {
                if (note.page() > doc.getNumberOfPages()) {
                    throw new RequestRejectedException(422, "A note refers to page " + note.page() + ", which does not exist.");
                }
                PDPage page = doc.getPage(note.page() - 1);
                page.getAnnotations().add(textAnnotation(note, page, author));
            }
            doc.save(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new RequestRejectedException(422, "Could not add the notes to this PDF.");
        }
    }

    private PDAnnotation textAnnotation(StickyNote note, PDPage page, String author) throws IOException {
        float[] p = toUserSpace(page, note.x(), note.y());
        // The icon hangs from the clicked point (its top-left corner), as in a viewer.
        PDRectangle rect = new PDRectangle(p[0], p[1] - NOTE_SIZE, NOTE_SIZE, NOTE_SIZE);

        PDAnnotationText annotation = new PDAnnotationText();
        annotation.setRectangle(rect);
        annotation.setContents(note.text());
        annotation.setName(PDAnnotationText.NAME_NOTE);
        annotation.setSubject("Note");
        if (author != null) annotation.setTitlePopup(author);
        annotation.setCreationDate(Calendar.getInstance());
        annotation.setModifiedDate(Calendar.getInstance());
        annotation.setAnnotationFlags(NOTE_FLAGS);
        annotation.setColor(new PDColor(rgb(note.color()), PDDeviceRGB.INSTANCE));
        annotation.setOpen(false);
        annotation.constructAppearances();
        return annotation;
    }

    /** {@code #rrggbb} as 0..1 components; the default note yellow when absent. */
    static float[] rgb(String hex) {
        if (hex == null) return new float[]{1f, 0.85f, 0.2f};
        int v = Integer.parseInt(hex.substring(1), 16);
        return new float[]{((v >> 16) & 0xff) / 255f, ((v >> 8) & 0xff) / 255f, (v & 0xff) / 255f};
    }

    /** Maps a point given as fractions of the displayed (rotated) page, from its top-left, to PDF user space. */
    static float[] toUserSpace(PDPage page, double fx, double fy) {
        PDRectangle box = page.getCropBox();
        double a;
        double b;
        switch (((page.getRotation() % 360) + 360) % 360) {
            case 90 -> { a = fy; b = fx; }
            case 180 -> { a = 1 - fx; b = fy; }
            case 270 -> { a = 1 - fy; b = 1 - fx; }
            default -> { a = fx; b = 1 - fy; }
        }
        // Keep the whole icon on the page.
        float x = (float) (box.getLowerLeftX() + a * box.getWidth());
        float y = (float) (box.getLowerLeftY() + b * box.getHeight());
        x = Math.min(Math.max(x, box.getLowerLeftX()), box.getUpperRightX() - NOTE_SIZE);
        y = Math.min(Math.max(y, box.getLowerLeftY() + NOTE_SIZE), box.getUpperRightY());
        return new float[]{x, y};
    }
}
