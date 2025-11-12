# Video Editor & Trimmer

A one-page video editing application with React frontend and Python backend.

## Features

- 🎬 Drag & drop video upload
- ✂️ Video trimming with start/end time controls
- 🎨 Video filters (brightness, contrast, saturation)
- ⬇️ Download edited videos

## Prerequisites

- Node.js 16+ and npm
- Python 3.8+
- FFmpeg (required by MoviePy)

### Install FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt-get install ffmpeg
```

**Windows:**
Download from https://ffmpeg.org/

## Setup

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install Python dependencies:
```bash
pip3 install -r requirements.txt
```

3. Run the Flask server:
```bash
python3 app.py
```

The backend will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install Node.js dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

## Usage

1. Start both backend and frontend servers (in separate terminals)
2. Open `http://localhost:3000` in your browser
3. Upload a video file by dragging and dropping or clicking to select
4. Set trim times using the input fields or sliders
5. Adjust video filters (brightness, contrast, saturation)
6. Click "Process Video" to edit
7. Download the edited video when processing is complete

## Project Structure

```
videotrim/
├── frontend/          # React application
│   ├── src/
│   │   ├── components/
│   │   │   ├── VideoEditor.jsx
│   │   │   └── VideoEditor.css
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.js
│   │   └── index.css
│   ├── public/
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── backend/           # Python Flask API
│   ├── app.py
│   ├── requirements.txt
│   └── uploads/       # Temporary upload folder
└── README.md
```

## Troubleshooting

- **FFmpeg not found**: Make sure FFmpeg is installed and in your PATH
- **Port already in use**: Change the port in `vite.config.js` (frontend) or `app.py` (backend)
- **CORS errors**: Ensure the backend is running before starting the frontend
- **Video processing fails**: Check that the video file format is supported (MP4, MOV, AVI, MKV)

## Notes

- The backend uses MoviePy for video processing
- For production, consider using FFmpeg directly for better performance
- Temporary files are cleaned up automatically
- Large video files may take longer to process

