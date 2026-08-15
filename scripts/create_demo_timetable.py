from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas


OUTPUT_PATH = Path(__file__).resolve().parents[1] / "public" / "semester-1-timetable.pdf"

ROWS = [
    ("Monday", "09:00", "10:00", "CS301", "Software Engineering", "Lecture"),
    ("Monday", "14:00", "16:00", "CS301", "Software Engineering", "Lab"),
    ("Tuesday", "10:00", "11:00", "CS302", "Computer Networks", "Lecture"),
    ("Tuesday", "13:00", "15:00", "CS304", "Databases", "Lab"),
    ("Wednesday", "09:00", "10:00", "CS303", "Applied Cryptography", "Lecture"),
    ("Wednesday", "15:00", "16:00", "CS305", "Algorithms", "Tutorial"),
    ("Thursday", "11:00", "12:00", "CS304", "Databases", "Lecture"),
    ("Thursday", "14:00", "16:00", "CS302", "Computer Networks", "Lab"),
    ("Friday", "10:00", "11:00", "CS305", "Algorithms", "Lecture"),
    ("Friday", "13:00", "15:00", "CS303", "Applied Cryptography", "Lab"),
]


def draw_text(canvas_obj, text, x, y, font="Helvetica", size=10, colour=colors.HexColor("#22313b")):
    canvas_obj.setFillColor(colour)
    canvas_obj.setFont(font, size)
    canvas_obj.drawString(x, y, text)


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    page_width, page_height = landscape(A4)
    pdf = canvas.Canvas(str(OUTPUT_PATH), pagesize=(page_width, page_height), pageCompression=0)
    pdf.setTitle("Semester 1 timetable")
    pdf.setSubject("A readable weekly timetable for PlanAround's local PDF import demo.")

    pdf.setFillColor(colors.HexColor("#f7f4ee"))
    pdf.rect(0, 0, page_width, page_height, fill=1, stroke=0)
    draw_text(pdf, "SEMESTER 1 TIMETABLE", 54, page_height - 58, "Helvetica-Bold", 20)
    draw_text(pdf, "Computer Science | Weekly teaching schedule", 54, page_height - 78, size=10, colour=colors.HexColor("#5b6770"))

    table_top = page_height - 122
    row_height = 34
    table_width = 630

    pdf.setFillColor(colors.HexColor("#dbe8e4"))
    pdf.roundRect(48, table_top - 26, table_width, 26, 6, fill=1, stroke=0)
    draw_text(pdf, "DAY       START  END    CODE   MODULE                         SESSION", 54, table_top - 17, "Courier-Bold", 8, colors.HexColor("#2d6457"))

    for index, row in enumerate(ROWS):
        day, start, end, code, module, session = row
        y = table_top - 26 - ((index + 1) * row_height)
        if index % 2 == 0:
            pdf.setFillColor(colors.white)
            pdf.rect(48, y, table_width, row_height, fill=1, stroke=0)
        pdf.setStrokeColor(colors.HexColor("#d7ddd8"))
        pdf.line(48, y, 678, y)
        parser_row = f"{day} {start} {end} {code} {module} {session}"
        draw_text(pdf, parser_row, 54, y + 12, "Courier", 9)

    draw_text(pdf, "Bring this document into PlanAround to turn it into an editable weekly calendar.", 54, 18, size=9, colour=colors.HexColor("#5b6770"))
    pdf.save()


if __name__ == "__main__":
    main()
