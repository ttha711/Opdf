@echo off
echo Đang kiểm tra thư viện PyMuPDF (fitz)...
python -c "import fitz" 2>nul
if errorlevel 1 (
    echo PyMuPDF chưa được cài đặt. Đang tiến hành cài đặt...
    pip install PyMuPDF
)

echo.
echo Đang tiến hành xử lý Slide...
python process_slides.py

echo.
echo Đang xác minh kết quả...
python verify_result.py

echo.
pause
