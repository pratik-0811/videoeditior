from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from moviepy.editor import VideoFileClip, TextClip, CompositeVideoClip, AudioFileClip, ImageClip, concatenate_videoclips
from moviepy.audio.AudioClip import CompositeAudioClip
import os
import tempfile
from werkzeug.utils import secure_filename
import numpy as np
import json

app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {
        "origins": "*",
        "methods": ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'mp4', 'mov', 'avi', 'mkv'}
ALLOWED_AUDIO_EXTENSIONS = {'mp3', 'wav', 'm4a', 'aac', 'ogg'}

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/api/process-video', methods=['POST', 'OPTIONS'])
def process_video():
    if request.method == 'OPTIONS':
        return '', 200
    
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400
    
    file = request.files['video']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type'}), 400
    
    try:
        # Get parameters
        start_time = float(request.form.get('start_time', 0))
        end_time = float(request.form.get('end_time', 0))
        background_audio_volume = float(request.form.get('background_audio_volume', 50)) / 100
        
        # Build clip_data object for process_single_clip
        clip_data = {
            'brightness': float(request.form.get('brightness', 100)),
            'contrast': float(request.form.get('contrast', 100)),
            'saturation': float(request.form.get('saturation', 100)),
            'hue': float(request.form.get('hue', 0)),
            'blur': float(request.form.get('blur', 0)),
            'sepia': float(request.form.get('sepia', 0)),
            'grayscale': float(request.form.get('grayscale', 0)),
            'zoom': float(request.form.get('zoom', 100)),
            'speed': float(request.form.get('speed', 1.0)),
            'rotation': int(request.form.get('rotation', 0)),
            'flipHorizontal': request.form.get('flip_horizontal', 'false').lower() == 'true',
            'flipVertical': request.form.get('flip_vertical', 'false').lower() == 'true',
            'crop': request.form.get('crop', '{"enabled": false}'),
            'muted': request.form.get('muted', 'false').lower() == 'true',
            'reversed': request.form.get('reversed', 'false').lower() == 'true',
            'subtitles': json.loads(request.form.get('subtitles', '[]'))
        }
        
        # Save uploaded file temporarily
        filename = secure_filename(file.filename)
        input_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(input_path)
        
        # Process video using process_single_clip function
        video = process_single_clip(input_path, clip_data, start_time, end_time)
        
        # Add background audio/music if provided
        if 'background_audio' in request.files:
            audio_file = request.files['background_audio']
            if audio_file.filename:
                audio_filename = secure_filename(audio_file.filename)
                audio_ext = audio_filename.rsplit('.', 1)[1].lower()
                if audio_ext in ALLOWED_AUDIO_EXTENSIONS:
                    audio_path = os.path.join(tempfile.gettempdir(), f'bg_audio_{os.getpid()}.{audio_ext}')
                    audio_file.save(audio_path)
                    
                    try:
                        background_audio = AudioFileClip(audio_path)
                        # Loop audio if it's shorter than video
                        if background_audio.duration < video.duration:
                            loops_needed = int(video.duration / background_audio.duration) + 1
                            background_audio = background_audio.loop(duration=video.duration)
                        
                        # Trim audio to video duration
                        background_audio = background_audio.subclip(0, min(background_audio.duration, video.duration))
                        
                        # Adjust volume
                        background_audio = background_audio.volumex(background_audio_volume)
                        
                        # Mix with original audio if video has audio
                        if video.audio:
                            # Lower original audio volume slightly when mixing
                            original_audio = video.audio.volumex(0.7)
                            final_audio = CompositeAudioClip([original_audio, background_audio])
                        else:
                            final_audio = background_audio
                        
                        video = video.set_audio(final_audio)
                    except Exception as e:
                        print(f"Error adding background audio: {e}")
                        # Continue without background audio if there's an error
        
        # Create output file
        output_path = os.path.join(tempfile.gettempdir(), f'edited_video_{os.getpid()}.mp4')
        print(f"Writing video to {output_path}")
        video.write_videofile(
            output_path,
            codec='libx264',
            audio_codec='aac',
            temp_audiofile=os.path.join(tempfile.gettempdir(), f'temp-audio-{os.getpid()}.m4a'),
            remove_temp=True,
            verbose=False,
            logger=None,
            preset='medium'
        )
        print(f"Video written successfully")
        
        # Clean up
        video.close()
        os.remove(input_path)
        
        return send_file(
            output_path,
            mimetype='video/mp4',
            as_attachment=True,
            download_name='edited-video.mp4'
        )
    
    except Exception as e:
        import traceback
        print(f"Error processing video: {str(e)}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/preview-video', methods=['POST', 'OPTIONS'])
def preview_video():
    """Generate a short preview (first 5 seconds) with all effects"""
    if request.method == 'OPTIONS':
        return '', 200
    
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400
    
    file = request.files['video']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type'}), 400
    
    try:
        # Get parameters (same as process-video)
        start_time = float(request.form.get('start_time', 0))
        end_time = float(request.form.get('end_time', 0))
        brightness = float(request.form.get('brightness', 100)) / 100
        contrast = float(request.form.get('contrast', 100)) / 100
        saturation = float(request.form.get('saturation', 100)) / 100
        zoom = float(request.form.get('zoom', 100)) / 100
        subtitles_json = request.form.get('subtitles', '[]')
        subtitles = json.loads(subtitles_json) if subtitles_json else []
        
        # Save uploaded file temporarily
        filename = secure_filename(file.filename)
        input_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(input_path)
        
        # Load video
        video = VideoFileClip(input_path)
        
        # Create preview - use trimmed section or full video
        trim_start = start_time
        trim_end = end_time if (start_time < end_time and end_time <= video.duration) else video.duration
        if start_time < end_time and end_time <= video.duration:
            preview_start = start_time
            preview_end = end_time
        elif start_time > 0:
            preview_start = start_time
            preview_end = video.duration
            trim_end = video.duration
        else:
            preview_start = 0
            preview_end = video.duration
            trim_start = 0
            trim_end = video.duration
        
        video = video.subclip(preview_start, preview_end)
        
        # Apply filters (same as process-video)
        if brightness != 1.0:
            def adjust_brightness(image):
                frame = image.astype(np.float32)
                adjusted = frame * brightness
                return np.clip(adjusted, 0, 255).astype(np.uint8)
            video = video.fl_image(adjust_brightness)
        
        if contrast != 1.0:
            def adjust_contrast(image):
                frame = image.astype(np.float32)
                adjusted = (frame - 128) * contrast + 128
                return np.clip(adjusted, 0, 255).astype(np.uint8)
            video = video.fl_image(adjust_contrast)
        
        if saturation != 1.0:
            from PIL import Image
            def adjust_saturation(image):
                img = Image.fromarray(image)
                hsv = img.convert('HSV')
                pixels = np.array(hsv, dtype=np.float32)
                pixels[:, :, 1] = np.clip(pixels[:, :, 1] * saturation, 0, 255)
                adjusted_img = Image.fromarray(pixels.astype(np.uint8), 'HSV').convert('RGB')
                return np.array(adjusted_img)
            video = video.fl_image(adjust_saturation)
        
        # Apply zoom
        if zoom != 1.0:
            w, h = video.size
            new_w = int(w / zoom)
            new_h = int(h / zoom)
            x_center = w / 2
            y_center = h / 2
            x1 = int(x_center - new_w / 2)
            y1 = int(y_center - new_h / 2)
            x2 = int(x_center + new_w / 2)
            y2 = int(y_center + new_h / 2)
            video = video.crop(x1=x1, y1=y1, x2=x2, y2=y2).resize((w, h))
        
        # Add subtitles (only those in preview range) - using same PIL method
        if subtitles:
            from PIL import Image, ImageDraw, ImageFont
            
            subtitle_clips = []
            for idx, subtitle in enumerate(subtitles):
                if subtitle.get('text') and subtitle.get('text').strip():
                    # Subtitle times are relative to original video, adjust for trim
                    original_start = float(subtitle.get('startTime', 0))
                    original_end = float(subtitle.get('endTime', original_start + 3))
                    
                    # Only include subtitles within the trimmed range
                    if original_end < trim_start or original_start > trim_end:
                        print(f"Preview subtitle {idx} outside trimmed range, skipping")
                        continue
                    
                    # Adjust times to be relative to trimmed video (subtract trim_start)
                    sub_start = max(0, original_start - trim_start)
                    sub_end = min(original_end - trim_start, video.duration)
                    text = subtitle.get('text', '').strip()
                    position = subtitle.get('position', 'bottom')
                    
                    # Ensure times are within trimmed video duration
                    sub_start = max(0, min(sub_start, video.duration - 0.1))
                    sub_end = max(sub_start + 0.1, min(sub_end, video.duration))
                    
                    font_size = max(32, min(72, int(video.h * 0.08)))
                    if position == 'bottom':
                        y_pos = video.h - font_size - 50
                    elif position == 'top':
                        y_pos = 50
                    else:
                        y_pos = video.h // 2
                    
                    try:
                        # Create subtitle image using PIL (same as main processing)
                        max_width = int(video.w * 0.9)
                        words = text.split()
                        lines = []
                        current_line = []
                        
                        for word in words:
                            test_line = ' '.join(current_line + [word])
                            estimated_width = len(test_line) * (font_size * 0.6)
                            if estimated_width <= max_width:
                                current_line.append(word)
                            else:
                                if current_line:
                                    lines.append(' '.join(current_line))
                                current_line = [word]
                        if current_line:
                            lines.append(' '.join(current_line))
                        
                        line_height = int(font_size * 1.4)
                        img_height = len(lines) * line_height + 30
                        img_width = max_width + 60
                        
                        img = Image.new('RGBA', (img_width, img_height), (0, 0, 0, 0))
                        draw = ImageDraw.Draw(img)
                        
                        font = None
                        font_paths = [
                            "/System/Library/Fonts/Helvetica.ttc",
                            "/System/Library/Fonts/Arial.ttf",
                            "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
                        ]
                        for font_path in font_paths:
                            try:
                                font = ImageFont.truetype(font_path, font_size)
                                break
                            except:
                                continue
                        
                        if font is None:
                            font = ImageFont.load_default()
                        
                        y_text = 15
                        for line in lines:
                            for dx in [-2, -1, 0, 1, 2]:
                                for dy in [-2, -1, 0, 1, 2]:
                                    if dx != 0 or dy != 0:
                                        try:
                                            draw.text((img_width//2 + dx, y_text + dy), line, 
                                                    font=font, fill=(0, 0, 0, 255), anchor='mm')
                                        except:
                                            draw.text((img_width//2 + dx, y_text + dy), line, 
                                                    font=font, fill=(0, 0, 0, 255))
                            try:
                                draw.text((img_width//2, y_text), line, 
                                        font=font, fill=(255, 255, 255, 255), anchor='mm')
                            except:
                                draw.text((img_width//2, y_text), line, 
                                        font=font, fill=(255, 255, 255, 255))
                            y_text += line_height
                        
                        img_path = os.path.join(tempfile.gettempdir(), f'preview_subtitle_{os.getpid()}_{idx}.png')
                        img.save(img_path)
                        
                        img_clip = ImageClip(img_path, duration=sub_end - sub_start)
                        img_clip = img_clip.set_start(sub_start)
                        img_clip = img_clip.set_position(('center', y_pos))
                        img_clip = img_clip.set_fps(video.fps)
                        subtitle_clips.append(img_clip)
                        print(f"Successfully created preview subtitle {idx} using PIL ImageClip")
                    except Exception as e:
                        print(f"Error creating preview subtitle {idx}: {e}")
                        import traceback
                        print(traceback.format_exc())
                        continue
            
            if subtitle_clips:
                video = CompositeVideoClip([video] + subtitle_clips).set_duration(video.duration)
        
        # Create preview output
        output_path = os.path.join(tempfile.gettempdir(), f'preview_{os.getpid()}.mp4')
        video.write_videofile(
            output_path,
            codec='libx264',
            audio_codec='aac',
            temp_audiofile=os.path.join(tempfile.gettempdir(), f'preview-audio-{os.getpid()}.m4a'),
            remove_temp=True,
            verbose=False,
            logger=None
        )
        
        video.close()
        os.remove(input_path)
        
        return send_file(
            output_path,
            mimetype='video/mp4',
            as_attachment=False,
            download_name='preview.mp4'
        )
    
    except Exception as e:
        import traceback
        print(f"Error creating preview: {str(e)}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

def process_single_clip(video_path, clip_data, trim_start, trim_end):
    """Process a single clip with filters, zoom, and subtitles"""
    from PIL import Image, ImageDraw, ImageFont
    
    # Load video
    video = VideoFileClip(video_path)
    
    # Trim video
    if trim_start < trim_end and trim_end <= video.duration:
        video = video.subclip(trim_start, trim_end)
    elif trim_start > 0:
        video = video.subclip(trim_start)
    
    # Apply speed (before other transformations)
    speed = float(clip_data.get('speed', 1.0))
    if speed != 1.0:
        video = video.fx(lambda clip: clip.speedx(speed))
    
    # Apply reverse
    reversed = clip_data.get('reversed', False)
    if reversed:
        video = video.fx(lambda clip: clip.time_mirror()) if hasattr(video, 'time_mirror') else video.fx(lambda clip: clip.fl_time(lambda t: clip.duration - t))
    
    # Apply rotation
    rotation = int(clip_data.get('rotation', 0))
    if rotation != 0:
        video = video.rotate(rotation)
    
    # Apply flip
    flip_horizontal = clip_data.get('flipHorizontal', False)
    flip_vertical = clip_data.get('flipVertical', False)
    if flip_horizontal:
        video = video.fx(lambda clip: clip.fl_image(lambda img: np.fliplr(img)))
    if flip_vertical:
        video = video.fx(lambda clip: clip.fl_image(lambda img: np.flipud(img)))
    
    # Apply crop
    crop_data = clip_data.get('crop', {})
    if isinstance(crop_data, str):
        try:
            crop_data = json.loads(crop_data)
        except (json.JSONDecodeError, TypeError):
            crop_data = {}
    if not isinstance(crop_data, dict):
        crop_data = {}
    if crop_data.get('enabled', False):
        w, h = video.size
        crop_x = float(crop_data.get('x', 0)) / 100
        crop_y = float(crop_data.get('y', 0)) / 100
        crop_width = float(crop_data.get('width', 100)) / 100
        crop_height = float(crop_data.get('height', 100)) / 100
        
        x1 = int(w * crop_x)
        y1 = int(h * crop_y)
        x2 = int(w * (crop_x + crop_width))
        y2 = int(h * (crop_y + crop_height))
        video = video.crop(x1=x1, y1=y1, x2=x2, y2=y2)
    
    # Apply filters
    brightness = float(clip_data.get('brightness', 100)) / 100
    contrast = float(clip_data.get('contrast', 100)) / 100
    saturation = float(clip_data.get('saturation', 100)) / 100
    hue = float(clip_data.get('hue', 0))
    blur = float(clip_data.get('blur', 0))
    sepia = float(clip_data.get('sepia', 0)) / 100
    grayscale = float(clip_data.get('grayscale', 0)) / 100
    zoom = float(clip_data.get('zoom', 100)) / 100
    
    if brightness != 1.0:
        def adjust_brightness(image):
            frame = image.astype(np.float32)
            adjusted = frame * brightness
            return np.clip(adjusted, 0, 255).astype(np.uint8)
        video = video.fl_image(adjust_brightness)
    
    if contrast != 1.0:
        def adjust_contrast(image):
            frame = image.astype(np.float32)
            adjusted = (frame - 128) * contrast + 128
            return np.clip(adjusted, 0, 255).astype(np.uint8)
        video = video.fl_image(adjust_contrast)
    
    if saturation != 1.0:
        def adjust_saturation(image):
            img = Image.fromarray(image)
            hsv = img.convert('HSV')
            pixels = np.array(hsv, dtype=np.float32)
            pixels[:, :, 1] = np.clip(pixels[:, :, 1] * saturation, 0, 255)
            adjusted_img = Image.fromarray(pixels.astype(np.uint8), 'HSV').convert('RGB')
            return np.array(adjusted_img)
        video = video.fl_image(adjust_saturation)
    
    if hue != 0:
        def adjust_hue(image):
            img = Image.fromarray(image)
            hsv = img.convert('HSV')
            pixels = np.array(hsv, dtype=np.float32)
            pixels[:, :, 0] = (pixels[:, :, 0] + hue) % 360
            adjusted_img = Image.fromarray(pixels.astype(np.uint8), 'HSV').convert('RGB')
            return np.array(adjusted_img)
        video = video.fl_image(adjust_hue)
    
    if blur > 0:
        try:
            from scipy import ndimage
            def apply_blur(image):
                return ndimage.gaussian_filter(image, sigma=blur)
            video = video.fl_image(apply_blur)
        except ImportError:
            # Fallback to simple blur if scipy not available
            from PIL import Image, ImageFilter
            def apply_blur(image):
                img = Image.fromarray(image)
                blurred = img.filter(ImageFilter.GaussianBlur(radius=blur))
                return np.array(blurred)
            video = video.fl_image(apply_blur)
    
    if sepia > 0:
        def apply_sepia(image):
            frame = image.astype(np.float32)
            sepia_matrix = np.array([[0.393 + 0.607 * (1 - sepia), 0.769 - 0.769 * sepia, 0.189 - 0.189 * sepia],
                                     [0.349 - 0.349 * sepia, 0.686 + 0.314 * (1 - sepia), 0.168 - 0.168 * sepia],
                                     [0.272 - 0.272 * sepia, 0.534 - 0.534 * sepia, 0.131 + 0.869 * (1 - sepia)]])
            sepia_frame = np.dot(frame, sepia_matrix.T)
            return np.clip(sepia_frame, 0, 255).astype(np.uint8)
        video = video.fl_image(apply_sepia)
    
    if grayscale > 0:
        def apply_grayscale(image):
            frame = image.astype(np.float32)
            gray = np.dot(frame[...,:3], [0.2989, 0.5870, 0.1140])
            gray_3d = np.stack([gray, gray, gray], axis=2)
            result = frame * (1 - grayscale) + gray_3d * grayscale
            return np.clip(result, 0, 255).astype(np.uint8)
        video = video.fl_image(apply_grayscale)
    
    if zoom != 1.0:
        w, h = video.size
        new_w = int(w / zoom)
        new_h = int(h / zoom)
        x_center = w / 2
        y_center = h / 2
        x1 = int(x_center - new_w / 2)
        y1 = int(y_center - new_h / 2)
        x2 = int(x_center + new_w / 2)
        y2 = int(y_center + new_h / 2)
        video = video.crop(x1=x1, y1=y1, x2=x2, y2=y2).resize((w, h))
    
    # Apply mute
    muted = clip_data.get('muted', False)
    if muted:
        video = video.without_audio()
    
    # Add subtitles
    subtitles = clip_data.get('subtitles', [])
    if not isinstance(subtitles, list):
        subtitles = []
    if subtitles:
        subtitle_clips = []
        for idx, subtitle in enumerate(subtitles):
            if subtitle.get('text') and subtitle.get('text').strip():
                original_start = float(subtitle.get('startTime', 0))
                original_end = float(subtitle.get('endTime', original_start + 3))
                
                # Adjust times relative to trimmed video
                start = max(0, original_start - trim_start)
                end = max(start + 0.1, min(original_end - trim_start, video.duration))
                text = subtitle.get('text', '').strip()
                position = subtitle.get('position', 'bottom')
                
                start = max(0, min(start, video.duration - 0.1))
                end = max(start + 0.1, min(end, video.duration))
                
                font_size = max(32, min(72, int(video.h * 0.08)))
                if position == 'bottom':
                    y_pos = video.h - font_size - 50
                elif position == 'top':
                    y_pos = 50
                else:
                    y_pos = video.h // 2
                
                try:
                    max_width = int(video.w * 0.9)
                    words = text.split()
                    lines = []
                    current_line = []
                    
                    for word in words:
                        test_line = ' '.join(current_line + [word])
                        estimated_width = len(test_line) * (font_size * 0.6)
                        if estimated_width <= max_width:
                            current_line.append(word)
                        else:
                            if current_line:
                                lines.append(' '.join(current_line))
                            current_line = [word]
                    if current_line:
                        lines.append(' '.join(current_line))
                    
                    line_height = int(font_size * 1.4)
                    img_height = len(lines) * line_height + 30
                    img_width = max_width + 60
                    
                    img = Image.new('RGBA', (img_width, img_height), (0, 0, 0, 0))
                    draw = ImageDraw.Draw(img)
                    
                    font = None
                    font_paths = [
                        "/System/Library/Fonts/Helvetica.ttc",
                        "/System/Library/Fonts/Arial.ttf",
                        "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
                    ]
                    for font_path in font_paths:
                        try:
                            font = ImageFont.truetype(font_path, font_size)
                            break
                        except:
                            continue
                    
                    if font is None:
                        font = ImageFont.load_default()
                    
                    y_text = 15
                    for line in lines:
                        for dx in [-2, -1, 0, 1, 2]:
                            for dy in [-2, -1, 0, 1, 2]:
                                if dx != 0 or dy != 0:
                                    try:
                                        draw.text((img_width//2 + dx, y_text + dy), line, 
                                                font=font, fill=(0, 0, 0, 255), anchor='mm')
                                    except:
                                        draw.text((img_width//2 + dx, y_text + dy), line, 
                                                font=font, fill=(0, 0, 0, 255))
                        try:
                            draw.text((img_width//2, y_text), line, 
                                    font=font, fill=(255, 255, 255, 255), anchor='mm')
                        except:
                            draw.text((img_width//2, y_text), line, 
                                    font=font, fill=(255, 255, 255, 255))
                        y_text += line_height
                    
                    img_path = os.path.join(tempfile.gettempdir(), f'subtitle_{os.getpid()}_{idx}.png')
                    img.save(img_path)
                    
                    img_clip = ImageClip(img_path, duration=end - start)
                    img_clip = img_clip.set_start(start)
                    img_clip = img_clip.set_position(('center', y_pos))
                    img_clip = img_clip.set_fps(video.fps)
                    
                    subtitle_clips.append(img_clip)
                except Exception as e:
                    print(f"Error creating subtitle {idx}: {e}")
                    continue
        
        if subtitle_clips:
            video = CompositeVideoClip([video] + subtitle_clips)
            video = video.set_duration(video.duration)
            video = video.set_fps(video.fps)
    
    return video

@app.route('/api/process-multiple-clips', methods=['POST', 'OPTIONS'])
def process_multiple_clips():
    if request.method == 'OPTIONS':
        return '', 200
    
    processed_clips = []
    temp_paths = []
    
    try:
        # Get clips data
        clips_data_json = request.form.get('clips_data', '[]')
        try:
            clips_data = json.loads(clips_data_json) if clips_data_json else []
        except json.JSONDecodeError as e:
            print(f"Error parsing clips_data JSON: {e}")
            print(f"Received data: {clips_data_json[:200]}")  # Print first 200 chars
            return jsonify({'error': f'Invalid JSON in clips_data: {str(e)}'}), 400
        
        if not clips_data:
            return jsonify({'error': 'No clips data provided'}), 400
        
        # Get all video files
        video_files = []
        index = 0
        while f'video_{index}' in request.files:
            video_files.append(request.files[f'video_{index}'])
            index += 1
        
        if len(video_files) != len(clips_data):
            return jsonify({'error': f'Number of video files ({len(video_files)}) does not match clips data ({len(clips_data)})'}), 400
        
        # Process each clip
        
        for idx, (video_file, clip_data) in enumerate(zip(video_files, clips_data)):
            try:
                if not video_file or not video_file.filename:
                    print(f"Skipping invalid video file at index {idx}")
                    continue
                    
                if not allowed_file(video_file.filename):
                    print(f"Skipping invalid file type: {video_file.filename}")
                    continue
                
                # Save uploaded file temporarily
                filename = secure_filename(video_file.filename)
                input_path = os.path.join(UPLOAD_FOLDER, f'{os.getpid()}_{idx}_{filename}')
                video_file.save(input_path)
                temp_paths.append(input_path)
                
                # Get clip parameters with validation
                try:
                    start_time = float(clip_data.get('startTime', 0))
                    end_time = float(clip_data.get('endTime', 0))
                except (ValueError, TypeError) as e:
                    print(f"Error parsing clip times for clip {idx}: {e}")
                    start_time = 0
                    end_time = 0
                
                # Validate clip_data structure
                if not isinstance(clip_data, dict):
                    print(f"Invalid clip_data type for clip {idx}: {type(clip_data)}")
                    clip_data = {}
                
                # Process the clip
                processed_clip = process_single_clip(input_path, clip_data, start_time, end_time)
                processed_clips.append(processed_clip)
            except Exception as e:
                import traceback
                print(f"Error processing clip {idx}: {str(e)}")
                print(traceback.format_exc())
                continue
        
        if not processed_clips:
            return jsonify({'error': 'No valid clips to process'}), 400
        
        # Concatenate all clips
        final_video = concatenate_videoclips(processed_clips, method="compose")
        
        # Add background audio if provided
        if 'background_audio' in request.files:
            audio_file = request.files['background_audio']
            if audio_file.filename:
                audio_filename = secure_filename(audio_file.filename)
                audio_ext = audio_filename.rsplit('.', 1)[1].lower()
                if audio_ext in ALLOWED_AUDIO_EXTENSIONS:
                    audio_path = os.path.join(tempfile.gettempdir(), f'bg_audio_{os.getpid()}.{audio_ext}')
                    audio_file.save(audio_path)
                    
                    try:
                        background_audio = AudioFileClip(audio_path)
                        if background_audio.duration < final_video.duration:
                            background_audio = background_audio.loop(duration=final_video.duration)
                        
                        background_audio = background_audio.subclip(0, min(background_audio.duration, final_video.duration))
                        background_audio_volume = float(request.form.get('background_audio_volume', 50)) / 100
                        background_audio = background_audio.volumex(background_audio_volume)
                        
                        if final_video.audio:
                            original_audio = final_video.audio.volumex(0.7)
                            final_audio = CompositeAudioClip([original_audio, background_audio])
                        else:
                            final_audio = background_audio
                        
                        final_video = final_video.set_audio(final_audio)
                    except Exception as e:
                        print(f"Error adding background audio: {e}")
        
        # Create output file
        output_path = os.path.join(tempfile.gettempdir(), f'edited_video_{os.getpid()}.mp4')
        final_video.write_videofile(
            output_path,
            codec='libx264',
            audio_codec='aac',
            temp_audiofile=os.path.join(tempfile.gettempdir(), f'temp-audio-{os.getpid()}.m4a'),
            remove_temp=True,
            verbose=False,
            logger=None,
            preset='medium'
        )
        
        # Clean up
        for clip in processed_clips:
            clip.close()
        final_video.close()
        for temp_path in temp_paths:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        
        return send_file(
            output_path,
            mimetype='video/mp4',
            as_attachment=True,
            download_name='edited-video.mp4'
        )
    
    except Exception as e:
        import traceback
        error_msg = str(e)
        error_trace = traceback.format_exc()
        print(f"Error processing multiple clips: {error_msg}")
        print(error_trace)
        # Clean up any temp files
        for temp_path in temp_paths:
            try:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            except:
                pass
        return jsonify({'error': error_msg, 'details': error_trace.split('\n')[-5:] if len(error_trace) > 100 else error_trace}), 500

@app.route('/api/preview-multiple-clips', methods=['POST', 'OPTIONS'])
def preview_multiple_clips():
    """Generate a preview of multiple clips concatenated together"""
    if request.method == 'OPTIONS':
        return '', 200
    
    processed_clips = []
    temp_paths = []
    
    try:
        # Get clips data
        clips_data_json = request.form.get('clips_data', '[]')
        try:
            clips_data = json.loads(clips_data_json) if clips_data_json else []
        except json.JSONDecodeError as e:
            print(f"Error parsing clips_data JSON: {e}")
            print(f"Received data: {clips_data_json[:200]}")  # Print first 200 chars
            return jsonify({'error': f'Invalid JSON in clips_data: {str(e)}'}), 400
        
        if not clips_data:
            return jsonify({'error': 'No clips data provided'}), 400
        
        # Get all video files
        video_files = []
        index = 0
        while f'video_{index}' in request.files:
            video_files.append(request.files[f'video_{index}'])
            index += 1
        
        if len(video_files) != len(clips_data):
            return jsonify({'error': f'Number of video files ({len(video_files)}) does not match clips data ({len(clips_data)})'}), 400
        
        # Process each clip
        
        for idx, (video_file, clip_data) in enumerate(zip(video_files, clips_data)):
            try:
                if not video_file or not video_file.filename:
                    print(f"Skipping invalid video file at index {idx}")
                    continue
                    
                if not allowed_file(video_file.filename):
                    print(f"Skipping invalid file type: {video_file.filename}")
                    continue
                
                # Save uploaded file temporarily
                filename = secure_filename(video_file.filename)
                input_path = os.path.join(UPLOAD_FOLDER, f'preview_{os.getpid()}_{idx}_{filename}')
                video_file.save(input_path)
                temp_paths.append(input_path)
                
                # Get clip parameters with validation
                try:
                    start_time = float(clip_data.get('startTime', 0))
                    end_time = float(clip_data.get('endTime', 0))
                except (ValueError, TypeError) as e:
                    print(f"Error parsing clip times for clip {idx}: {e}")
                    start_time = 0
                    end_time = 0
                
                # Validate clip_data structure
                if not isinstance(clip_data, dict):
                    print(f"Invalid clip_data type for clip {idx}: {type(clip_data)}")
                    clip_data = {}
                
                # Process the clip
                processed_clip = process_single_clip(input_path, clip_data, start_time, end_time)
                processed_clips.append(processed_clip)
            except Exception as e:
                import traceback
                print(f"Error processing clip {idx}: {str(e)}")
                print(traceback.format_exc())
                continue
        
        if not processed_clips:
            return jsonify({'error': 'No valid clips to process'}), 400
        
        # Concatenate all clips
        final_video = concatenate_videoclips(processed_clips, method="compose")
        
        # Add background audio if provided
        if 'background_audio' in request.files:
            audio_file = request.files['background_audio']
            if audio_file.filename:
                audio_filename = secure_filename(audio_file.filename)
                audio_ext = audio_filename.rsplit('.', 1)[1].lower()
                if audio_ext in ALLOWED_AUDIO_EXTENSIONS:
                    audio_path = os.path.join(tempfile.gettempdir(), f'preview_bg_audio_{os.getpid()}.{audio_ext}')
                    audio_file.save(audio_path)
                    
                    try:
                        background_audio = AudioFileClip(audio_path)
                        if background_audio.duration < final_video.duration:
                            background_audio = background_audio.loop(duration=final_video.duration)
                        
                        background_audio = background_audio.subclip(0, min(background_audio.duration, final_video.duration))
                        background_audio_volume = float(request.form.get('background_audio_volume', 50)) / 100
                        background_audio = background_audio.volumex(background_audio_volume)
                        
                        if final_video.audio:
                            original_audio = final_video.audio.volumex(0.7)
                            final_audio = CompositeAudioClip([original_audio, background_audio])
                        else:
                            final_audio = background_audio
                        
                        final_video = final_video.set_audio(final_audio)
                    except Exception as e:
                        print(f"Error adding background audio: {e}")
        
        # Create preview output
        output_path = os.path.join(tempfile.gettempdir(), f'preview_multiple_{os.getpid()}.mp4')
        final_video.write_videofile(
            output_path,
            codec='libx264',
            audio_codec='aac',
            temp_audiofile=os.path.join(tempfile.gettempdir(), f'preview-temp-audio-{os.getpid()}.m4a'),
            remove_temp=True,
            verbose=False,
            logger=None,
            preset='medium'
        )
        
        # Clean up
        for clip in processed_clips:
            clip.close()
        final_video.close()
        for temp_path in temp_paths:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        
        return send_file(
            output_path,
            mimetype='video/mp4',
            as_attachment=False,
            download_name='preview.mp4'
        )
    
    except Exception as e:
        import traceback
        error_msg = str(e)
        error_trace = traceback.format_exc()
        print(f"Error creating preview: {error_msg}")
        print(error_trace)
        # Clean up any temp files
        for temp_path in temp_paths:
            try:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            except:
                pass
        return jsonify({'error': error_msg, 'details': error_trace.split('\n')[-5:] if len(error_trace) > 100 else error_trace}), 500

@app.route('/api/health', methods=['GET'])
def health():
    return {'status': 'ok'}, 200

if __name__ == '__main__':
    app.run(debug=True, port=5001, host='0.0.0.0')

