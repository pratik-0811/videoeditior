import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import './VideoEditor.css';

const VideoEditor = () => {
  // Multi-track timeline state
  const [tracks, setTracks] = useState([
    { id: 'track-video-1', type: 'video', name: 'Video Track 1', items: [], locked: false, muted: false, visible: true, collapsed: false },
    { id: 'track-audio-1', type: 'audio', name: 'Audio Track 1', items: [], locked: false, muted: false, visible: true, collapsed: false },
    { id: 'track-subtitle-1', type: 'subtitle', name: 'Subtitle Track 1', items: [], locked: false, muted: false, visible: true, collapsed: false }
  ]);
  const [selectedTrackId, setSelectedTrackId] = useState('track-video-1');
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [timelineZoom, setTimelineZoom] = useState(1); // Zoom level for timeline
  const [editingTrackId, setEditingTrackId] = useState(null); // Track being renamed
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0); // Horizontal scroll position
  const [showMinimap, setShowMinimap] = useState(false); // Mini-map visibility
  
  // Clip-based state
  const [clips, setClips] = useState([]); // Array of video clips
  const [selectedClipId, setSelectedClipId] = useState(null); // Currently selected clip
  
  // Legacy state for backward compatibility (will be removed)
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [originalDuration, setOriginalDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const videoRef = useRef(null);
  const timelineRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [filters, setFilters] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    blur: 0,
    sepia: 0,
    grayscale: 0
  });
  const [zoom, setZoom] = useState(100);
  const [speed, setSpeed] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [crop, setCrop] = useState({
    enabled: false,
    x: 0,
    y: 0,
    width: 100,
    height: 100
  });
  const [muted, setMuted] = useState(false);
  const [reversed, setReversed] = useState(false);
  const [subtitles, setSubtitles] = useState([]);
  const [showSubtitleEditor, setShowSubtitleEditor] = useState(false);
  const [editingSubtitle, setEditingSubtitle] = useState(null);
  const [backgroundAudio, setBackgroundAudio] = useState(null);
  const [backgroundAudioVolume, setBackgroundAudioVolume] = useState(50);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [autoPreview, setAutoPreview] = useState(true); // Auto-preview toggle - enabled by default
  const previewDebounceTimerRef = useRef(null);
  const [isDraggingSubtitle, setIsDraggingSubtitle] = useState(false);
  const [subtitleDragStart, setSubtitleDragStart] = useState(null);
  const [isClickingTimeline, setIsClickingTimeline] = useState(false);
  const [timelineClickStart, setTimelineClickStart] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, text: '' });
  const tooltipRef = useRef(null);
  const [dragState, setDragState] = useState({ isDragging: false, dragItemId: null, dragTrackId: null, hoverTrackId: null });

  const onDrop = (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;
    
    // Handle video files
    if (file.type.startsWith('video/')) {
      // Add video at current time or at the end of timeline
      const videoTrack = tracks.find(t => t.type === 'video');
      if (videoTrack) {
        // Calculate where to place the video
        let placementTime = currentTime;
        if (placementTime === 0) {
          // If at start, check if there are items and place at end
          let maxEnd = 0;
          tracks.forEach(t => {
            t.items.forEach(item => {
              const itemEnd = (item.startTime || 0) + (item.duration || 0);
              if (itemEnd > maxEnd) maxEnd = itemEnd;
            });
          });
          placementTime = maxEnd;
        }
        
        addClip(file).then(clip => {
          if (clip) {
            // Update the item's start time to placement time
            setTracks(prevTracks => prevTracks.map(track => {
              if (track.id === videoTrack.id) {
                const item = track.items.find(i => i.clipId === clip.id);
                if (item) {
                  return {
                    ...track,
                    items: track.items.map(i => 
                      i.id === item.id ? { ...i, startTime: placementTime } : i
                    )
                  };
                }
              }
              return track;
            }));
          }
        });
      } else {
        addClip(file);
      }
    }
    // Handle audio files
    else if (file.type.startsWith('audio/')) {
      const audioTrack = tracks.find(t => t.type === 'audio');
      if (audioTrack) {
        // Calculate placement time
        let placementTime = currentTime;
        if (placementTime === 0) {
          let maxEnd = 0;
          tracks.forEach(t => {
            t.items.forEach(item => {
              const itemEnd = (item.startTime || 0) + (item.duration || 0);
              if (itemEnd > maxEnd) maxEnd = itemEnd;
            });
          });
          placementTime = maxEnd;
        }
        
      const url = URL.createObjectURL(file);
        const audio = document.createElement('audio');
        audio.src = url;
        audio.onloadedmetadata = () => {
          const audioItem = {
            id: `audio-item-${Date.now()}-${Math.random()}`,
            type: 'audio',
            startTime: placementTime,
            duration: audio.duration,
            file: file,
            url: url
          };
          addItemToTrack(audioTrack.id, audioItem);
        };
      }
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.mkv'],
      'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.ogg']
    },
    multiple: false
  });

  // Sync changes back to selected clip
  useEffect(() => {
    if (selectedClipId) {
      setClips(prev => {
        const updatedClips = prev.map(clip => {
          if (clip.id === selectedClipId) {
            // Ensure startTime and endTime are valid
            const originalDur = clip.originalDuration || 0;
            const validStartTime = Math.max(0, Math.min(startTime, originalDur));
            const validEndTime = Math.max(validStartTime + 0.001, Math.min(endTime, originalDur)); // 0.001s minimum to prevent invalid state
            
            return {
              ...clip,
              startTime: validStartTime,
              endTime: validEndTime,
              filters,
              zoom,
              speed,
              rotation,
              flipHorizontal,
              flipVertical,
              crop,
              muted,
              reversed,
              subtitles
            };
          }
          return clip;
        });
        
        // Also update timeline item - duration should match trimmed duration
        // Use functional update to avoid dependency on clips
        setTracks(prevTracks => {
          const selectedClip = updatedClips.find(c => c.id === selectedClipId);
          if (!selectedClip) return prevTracks;
          
          return prevTracks.map(track => ({
            ...track,
            items: track.items.map(item => {
              if (item.clipId === selectedClipId) {
                // Ensure startTime and endTime are valid for timeline item
                const originalDur = selectedClip.originalDuration || 0;
                const validStartTime = Math.max(0, Math.min(startTime, originalDur));
                const validEndTime = Math.max(validStartTime + 0.001, Math.min(endTime, originalDur)); // 0.001s minimum to prevent invalid state
                // Duration should be the trimmed duration (endTime - startTime)
                const trimmedDuration = validEndTime - validStartTime;
                
                // Keep the timeline position (item.startTime) but update duration
                return {
                  ...item,
                  duration: trimmedDuration, // This is the trimmed duration displayed in timeline
                  endTime: validEndTime, // Store for reference
                  filters,
                  zoom,
                  speed,
                  rotation,
                  flipHorizontal,
                  flipVertical,
                  crop,
                  muted,
                  reversed
                };
              }
              return item;
            })
          }));
        });
        
        return updatedClips;
      });
    }
  }, [startTime, endTime, filters, zoom, speed, rotation, flipHorizontal, flipVertical, crop, muted, reversed, subtitles, selectedClipId]);

  useEffect(() => {
    if (videoRef.current && (videoUrl || previewUrl)) {
      const currentVideoUrl = previewUrl || videoUrl;
      
      // Get the current video element's URL (handle blob URLs properly)
      const currentSrc = videoRef.current.src;
      const currentSrcClean = currentSrc.includes('blob:') ? currentSrc : currentSrc.split('?')[0];
      const newSrcClean = currentVideoUrl.includes('blob:') ? currentVideoUrl : currentVideoUrl.split('?')[0];
      
      // Update video source if it changed
      if (currentSrcClean !== newSrcClean && currentVideoUrl) {
        videoRef.current.src = currentVideoUrl;
        videoRef.current.load(); // Force reload
      }
      
      videoRef.current.onloadedmetadata = () => {
        if (videoRef.current) {
          const videoDuration = videoRef.current.duration;
          // If this is the original video (not preview), store as original duration
          if (!previewUrl) {
            // Only update if we have a selected clip
            if (selectedClipId) {
              const clip = clips.find(c => c.id === selectedClipId);
              if (clip) {
                setOriginalDuration(clip.originalDuration || videoDuration);
                setDuration(videoDuration);
                setEndTime(clip.endTime || videoDuration);
              } else {
                setOriginalDuration(videoDuration);
                setDuration(videoDuration);
                setEndTime(videoDuration);
              }
            } else {
              setOriginalDuration(videoDuration);
              setDuration(videoDuration);
              setEndTime(videoDuration);
            }
          } else {
            // For preview, keep original duration for timeline calculations
            // Only update current video duration for playback
            setDuration(videoDuration);
          }
        }
      };
      
      // Update current time as video plays - use requestAnimationFrame for smooth playhead sync
      let rafId = null;
      let lastUpdateTime = 0;
      
      const updateTime = () => {
        if (videoRef.current) {
          const now = performance.now();
          // Throttle updates to ~60fps for smooth playhead movement
          if (now - lastUpdateTime >= 16) {
            lastUpdateTime = now;
            
            // If preview is active, convert preview time back to original video time
            if (previewUrl) {
              setCurrentTime(videoRef.current.currentTime + startTime);
            } else {
              // For multi-track timeline, calculate timeline position from selected clip
              if (selectedClipId) {
                const clip = clips.find(c => c.id === selectedClipId);
                if (clip) {
                  // Find the timeline item for this clip
                  let itemStartTime = 0;
                  for (const track of tracks) {
                    const item = track.items.find(i => i.clipId === selectedClipId);
                    if (item) {
                      itemStartTime = item.startTime || 0;
                      break;
                    }
                  }
                  // Calculate timeline position: item's timeline startTime + video's currentTime
                  const timelineTime = itemStartTime + videoRef.current.currentTime;
                  setCurrentTime(timelineTime);
                } else {
                  setCurrentTime(videoRef.current.currentTime);
                }
              } else {
                // Check if there's a timeline item for the current video
                let timelineTime = videoRef.current.currentTime;
                console.log('timelineTime', timelineTime);
                console.log('tracks', tracks);
                for (const track of tracks) {
                  for (const item of track.items) {
                    if (item.url === videoUrl || item.clipId) {
                      timelineTime = (item.startTime || 0) + videoRef.current.currentTime;
                      break;
                    }
                  }
                }
                setCurrentTime(timelineTime);
              }
            }
          }
          
          // Continue animation frame loop if video is playing
          if (videoRef.current && !videoRef.current.paused && !videoRef.current.ended) {
            rafId = requestAnimationFrame(updateTime);
          }
        }
      };
      
      // Also listen to timeupdate as fallback for when not using RAF (when paused)
      const handleTimeUpdate = () => {
        if (videoRef.current && videoRef.current.paused) {
          updateTime();
        }
      };
      
      // Listen to play/pause events to start/stop RAF loop
      const handlePlay = () => {
        if (rafId === null) {
          rafId = requestAnimationFrame(updateTime);
        }
      };
      
      const handlePause = () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        updateTime(); // Update one final time on pause
      };
      
      // Use requestAnimationFrame for smooth playhead updates during playback
      if (videoRef.current && !videoRef.current.paused) {
        rafId = requestAnimationFrame(updateTime);
      }
      
      videoRef.current.addEventListener('timeupdate', handleTimeUpdate);
      videoRef.current.addEventListener('play', handlePlay);
      videoRef.current.addEventListener('pause', handlePause);
      
      return () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
        if (videoRef.current) {
          videoRef.current.removeEventListener('timeupdate', handleTimeUpdate);
          videoRef.current.removeEventListener('play', handlePlay);
          videoRef.current.removeEventListener('pause', handlePause);
        }
      };
    }
  }, [videoUrl, previewUrl, selectedClipId, clips, tracks]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // Snapping threshold in seconds (0.1s = 100ms)
  const SNAP_THRESHOLD = 0.1;
  const [snapEnabled, setSnapEnabled] = useState(true);

  // Helper function to find snap points (other items' edges and playhead)
  // Only includes items from the same track unless explicitly allowing cross-track snapping
  const getSnapPoints = (excludeItemId = null, excludeTrackId = null, sameTrackOnly = true) => {
    const snapPoints = [];
    const timelineDuration = getTimelineDuration();
    
    // Add playhead as snap point (global, always included)
    snapPoints.push({ time: currentTime, type: 'playhead' });
    
    // Add timeline start and end (global markers)
    snapPoints.push({ time: 0, type: 'start' });
    snapPoints.push({ time: timelineDuration, type: 'end' });
    
    // Add item edges - by default only from the same track for independent movement
    tracks.forEach(track => {
      // If sameTrackOnly is true and we have a track context, only include that track
      if (sameTrackOnly && excludeTrackId && track.id !== excludeTrackId) {
        return; // Skip other tracks
      }
      
      track.items.forEach(item => {
        // Skip the item being dragged
        if (item.id === excludeItemId) return;
        
        const itemStart = item.startTime || 0;
        const itemEnd = itemStart + (item.duration || 0);
        
        snapPoints.push({ time: itemStart, type: 'item-start', itemId: item.id, trackId: track.id });
        snapPoints.push({ time: itemEnd, type: 'item-end', itemId: item.id, trackId: track.id });
      });
    });
    
    return snapPoints.sort((a, b) => a.time - b.time);
  };

  // Helper function to snap a time value to nearest snap point
  // By default, only snaps to items on the same track to maintain independent movement
  const snapToNearest = (time, excludeItemId = null, excludeTrackId = null, sameTrackOnly = true) => {
    if (!snapEnabled) return time;
    
    const snapPoints = getSnapPoints(excludeItemId, excludeTrackId, sameTrackOnly);
    let nearestTime = time;
    let minDistance = Infinity;
    
    snapPoints.forEach(point => {
      const distance = Math.abs(point.time - time);
      if (distance < minDistance && distance <= SNAP_THRESHOLD) {
        minDistance = distance;
        nearestTime = point.time;
      }
    });
    
    return nearestTime;
  };

  // Helper function to check if two time ranges overlap
  const doRangesOverlap = (start1, end1, start2, end2) => {
    return start1 < end2 && start2 < end1;
  };

  // Helper function to check if an item would overlap with other items on the same track
  const wouldOverlap = (trackId, itemId, newStartTime, itemDuration, excludeItemId = null) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return false;
    
    const newEndTime = newStartTime + itemDuration;
    
    return track.items.some(item => {
      // Skip the item being moved
      if (item.id === itemId || item.id === excludeItemId) return false;
      
      const itemStart = item.startTime || 0;
      const itemEnd = itemStart + (item.duration || 0);
      
      return doRangesOverlap(newStartTime, newEndTime, itemStart, itemEnd);
    });
  };

  // Helper function to constrain item position within timeline bounds
  const constrainItemPosition = (startTime, duration, timelineDuration) => {
    const maxStart = Math.max(0, timelineDuration - duration);
    const constrainedStart = Math.max(0, Math.min(startTime, maxStart));
    return constrainedStart;
  };

  // Helper function to find a non-overlapping position for an item
  const findNonOverlappingPosition = (trackId, itemId, preferredStartTime, itemDuration, excludeItemId = null) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return preferredStartTime;
    
    const timelineDuration = getTimelineDuration();
    let candidateStart = constrainItemPosition(preferredStartTime, itemDuration, timelineDuration);
    
    // If no overlap, return the preferred position
    if (!wouldOverlap(trackId, itemId, candidateStart, itemDuration, excludeItemId)) {
      return candidateStart;
    }
    
    // Try to place after the last item
    let maxEnd = 0;
    track.items.forEach(item => {
      if (item.id === itemId || item.id === excludeItemId) return;
      const itemEnd = (item.startTime || 0) + (item.duration || 0);
      if (itemEnd > maxEnd) maxEnd = itemEnd;
    });
    
    candidateStart = Math.max(maxEnd, constrainItemPosition(preferredStartTime, itemDuration, timelineDuration));
    
    // If still overlaps, try to place before the first overlapping item
    if (wouldOverlap(trackId, itemId, candidateStart, itemDuration, excludeItemId)) {
      const sortedItems = [...track.items]
        .filter(item => item.id !== itemId && item.id !== excludeItemId)
        .sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
      
      for (const item of sortedItems) {
        const itemStart = item.startTime || 0;
        const itemEnd = itemStart + (item.duration || 0);
        
        // Try placing before this item
        const beforeStart = constrainItemPosition(itemStart - itemDuration, itemDuration, timelineDuration);
        if (!wouldOverlap(trackId, itemId, beforeStart, itemDuration, excludeItemId)) {
          return beforeStart;
        }
        
        // If we can't place before, try after
        const afterStart = constrainItemPosition(itemEnd, itemDuration, timelineDuration);
        if (!wouldOverlap(trackId, itemId, afterStart, itemDuration, excludeItemId)) {
          return afterStart;
        }
      }
    }
    
    return candidateStart;
  };

  // Handle timeline click to seek video - improved and more user-friendly
  const handleTimelineClick = (e, timelineElement) => {
    if (!timelineElement) return;
    
    e.stopPropagation();
    
    const rect = timelineElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const duration = getTimelineDuration();
    
    // Calculate clicked time more accurately
    const clickedTime = duration > 0 ? (x / rect.width) * duration / timelineZoom : 0;
    const clampedTime = Math.max(0, Math.min(clickedTime, duration));
    
    // Update current time immediately for responsive feedback
    setCurrentTime(clampedTime);
    
    // Find which clip/item is at this timeline position
    let foundClip = null;
    let foundItem = null;
    let clipLocalTime = 0;
    
    // Check timeline items first (most accurate)
    for (const track of tracks) {
      if (!track.visible) continue; // Skip hidden tracks
      
      for (const item of track.items) {
        const itemStart = item.startTime || 0;
        const itemDuration = item.duration || 0;
        const itemEnd = itemStart + itemDuration;
        
        if (clampedTime >= itemStart && clampedTime < itemEnd) {
          // Found an item at this position
          foundItem = item;
          if (item.clipId) {
            foundClip = clips.find(c => c.id === item.clipId);
            if (foundClip) {
              // Calculate local time within the item
              clipLocalTime = clampedTime - itemStart;
              break;
            }
          }
        }
      }
      if (foundClip) break;
    }
    
    // If no item found, check clips directly
    if (!foundClip && clips.length > 0) {
      for (const clip of clips) {
        const clipStart = clip.startTime || 0;
        const clipDuration = clip.originalDuration || clip.endTime || 0;
        const clipEnd = clipStart + clipDuration;
        if (clampedTime >= clipStart && clampedTime < clipEnd) {
          foundClip = clip;
          clipLocalTime = clampedTime - clipStart;
          break;
        }
      }
    }
    
    // Seek video to the clicked position
    if (videoRef.current && (videoUrl || previewUrl)) {
      if (foundClip) {
        // Seek to the local time within the clip
        const seekTime = Math.max(0, Math.min(clipLocalTime, foundClip.originalDuration || foundClip.endTime || 0));
        
        if (previewUrl) {
          // For preview, adjust based on trim
          const previewTime = Math.max(0, Math.min(seekTime - foundClip.startTime, foundClip.endTime - foundClip.startTime));
          videoRef.current.currentTime = previewTime;
        } else {
          // For original video, seek to absolute time within clip
          videoRef.current.currentTime = seekTime;
        }
        
        // Select the clip if not already selected
        if (selectedClipId !== foundClip.id) {
          setSelectedClipId(foundClip.id);
          selectClip(foundClip.id);
        }
      } else if (clips.length > 0) {
        // No clip found at position, but clips exist - seek first clip
        const firstClip = clips[0];
        if (previewUrl) {
          videoRef.current.currentTime = Math.max(0, Math.min(clampedTime - startTime, duration));
        } else {
          videoRef.current.currentTime = Math.max(0, Math.min(clampedTime, firstClip.originalDuration || firstClip.endTime || 0));
        }
      } else {
        // No clips at all, seek to timeline time
        if (previewUrl) {
          videoRef.current.currentTime = Math.max(0, Math.min(clampedTime - startTime, duration));
        } else {
          videoRef.current.currentTime = Math.max(0, Math.min(clampedTime, originalDuration || duration));
        }
      }
    }
  };

  // Track management functions
  const addTrack = (type) => {
    const trackNumber = tracks.filter(t => t.type === type).length + 1;
    const newTrack = {
      id: `track-${type}-${Date.now()}`,
      type: type,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} Track ${trackNumber}`,
      items: [],
      locked: false,
      muted: false,
      visible: true,
      collapsed: false
    };
    setTracks(prev => [...prev, newTrack]);
    setSelectedTrackId(newTrack.id);
  };

  const toggleTrackCollapse = (trackId) => {
    setTracks(prev => prev.map(track =>
      track.id === trackId ? { ...track, collapsed: !track.collapsed } : track
    ));
  };

  const updateTrackName = (trackId, newName) => {
    if (newName.trim()) {
      setTracks(prev => prev.map(track =>
        track.id === trackId ? { ...track, name: newName.trim() } : track
      ));
    }
    setEditingTrackId(null);
  };

  const removeTrack = (trackId) => {
    if (tracks.length <= 1) {
      alert('Cannot remove the last track');
      return;
    }
    setTracks(prev => prev.filter(t => t.id !== trackId));
    if (selectedTrackId === trackId) {
      const remainingTracks = tracks.filter(t => t.id !== trackId);
      setSelectedTrackId(remainingTracks[0]?.id || '');
    }
  };

  const addItemToTrack = (trackId, item) => {
    setTracks(prev => prev.map(track => {
      if (track.id === trackId) {
        return { ...track, items: [...track.items, item] };
      }
      return track;
    }));
  };

  const removeItemFromTrack = (trackId, itemId) => {
    setTracks(prev => prev.map(track => {
      if (track.id === trackId) {
        return { ...track, items: track.items.filter(item => item.id !== itemId) };
      }
      return track;
    }));
  };

  const updateItemInTrack = (trackId, itemId, updates) => {
    setTracks(prev => prev.map(track => {
      if (track.id === trackId) {
        return {
          ...track,
          items: track.items.map(item =>
            item.id === itemId ? { ...item, ...updates } : item
          )
        };
      }
      return track;
    }));
  };

  const toggleTrackLock = (trackId) => {
    setTracks(prev => prev.map(track =>
      track.id === trackId ? { ...track, locked: !track.locked } : track
    ));
  };

  const toggleTrackMute = (trackId) => {
    setTracks(prev => prev.map(track =>
      track.id === trackId ? { ...track, muted: !track.muted } : track
    ));
  };

  const toggleTrackVisibility = (trackId) => {
    setTracks(prev => prev.map(track =>
      track.id === trackId ? { ...track, visible: !track.visible } : track
    ));
  };

  // Split all items at current playhead position across all tracks
  const splitAllTracksAtCurrentTime = () => {
    if (currentTime <= 0) {
      alert('Please position the playhead at a valid time to split');
      return;
    }

    let hasSplitItems = false;
    const itemsToSplit = [];

    // Find all items that need to be split across all tracks
    tracks.forEach(track => {
      if (track.locked) return; // Skip locked tracks
      
      track.items.forEach(item => {
        const itemStart = item.startTime || 0;
        const itemEnd = itemStart + (item.duration || 0);
        
        // Check if currentTime is within the item's time range
        if (currentTime > itemStart && currentTime < itemEnd) {
          itemsToSplit.push({ trackId: track.id, itemId: item.id });
          hasSplitItems = true;
        }
      });
    });

    if (!hasSplitItems) {
      alert('No items found at the current playhead position to split');
      return;
    }

    // Split all found items (suppress individual alerts since we already checked)
    itemsToSplit.forEach(({ trackId, itemId }) => {
      splitTimelineItem(trackId, itemId, true);
    });
  };

  // Split timeline item at current playhead position
  const splitTimelineItem = (trackId, itemId, suppressAlert = false) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track || track.locked) return;

    const item = track.items.find(i => i.id === itemId);
    if (!item) return;

    const itemStart = item.startTime || 0;
    const itemEnd = itemStart + (item.duration || 0);
    
    // Check if currentTime is within the item's time range
    if (currentTime <= itemStart || currentTime >= itemEnd) {
      if (!suppressAlert) {
        alert('Please position the playhead within the item to split');
      }
      return;
    }

    // Calculate split position relative to item start
    const splitOffset = currentTime - itemStart;

    // Handle video items (with clipId)
    if (item.clipId) {
      const clip = clips.find(c => c.id === item.clipId);
      if (!clip) return;

      // Calculate the actual video time where we're splitting
      const clipTrimStart = clip.startTime || 0;
      const clipTrimEnd = clip.endTime || clip.originalDuration || 0;
      const clipTrimDuration = clipTrimEnd - clipTrimStart;
      
      // Map timeline split position to video time
      const splitPercent = splitOffset / (item.duration || clipTrimDuration);
      const videoSplitTime = clipTrimStart + (splitPercent * clipTrimDuration);

      // Create first clip (keep original id, update endTime)
      const firstClip = {
        ...clip,
        endTime: videoSplitTime
      };

      // Create second clip (new id, update startTime)
      const secondClip = {
        ...clip,
        id: Date.now() + Math.random(),
        startTime: videoSplitTime,
        file: clip.file,
        url: clip.url
      };

      // Update clips array
      setClips(prev => {
        const index = prev.findIndex(c => c.id === item.clipId);
        const newClips = [...prev];
        newClips[index] = firstClip;
        newClips.splice(index + 1, 0, secondClip);
        return newClips;
      });

      // Update timeline items
      setTracks(prevTracks => prevTracks.map(t => {
        if (t.id === trackId) {
          const itemIndex = t.items.findIndex(i => i.id === itemId);
          if (itemIndex === -1) return t;

          const firstItemDuration = splitOffset;
          const secondItemStart = itemStart + splitOffset;
          const secondItemDuration = (item.duration || 0) - splitOffset;

          // First item (keep original id, update duration)
          const firstItem = {
            ...item,
            duration: firstItemDuration,
            endTime: videoSplitTime
          };

          // Second item (new id, new startTime)
          const secondItem = {
            ...item,
            id: `item-${Date.now()}-${Math.random()}`,
            clipId: secondClip.id,
            startTime: secondItemStart,
            duration: secondItemDuration,
            endTime: clipTrimEnd
          };

          const newItems = [...t.items];
          newItems[itemIndex] = firstItem;
          newItems.splice(itemIndex + 1, 0, secondItem);

          return { ...t, items: newItems };
        }
        return t;
      }));

      // Select the first clip
      setSelectedClipId(firstClip.id);
      setSelectedItemId(itemId);
    }
    // Handle audio items
    else if (item.type === 'audio') {
      const firstItemDuration = splitOffset;
      const secondItemStart = itemStart + splitOffset;
      const secondItemDuration = (item.duration || 0) - splitOffset;

      // First item (keep original id, update duration)
      const firstItem = {
        ...item,
        duration: firstItemDuration
      };

      // Second item (new id, new startTime)
      const secondItem = {
        ...item,
        id: `audio-item-${Date.now()}-${Math.random()}`,
        startTime: secondItemStart,
        duration: secondItemDuration
      };

      setTracks(prevTracks => prevTracks.map(t => {
        if (t.id === trackId) {
          const itemIndex = t.items.findIndex(i => i.id === itemId);
          if (itemIndex === -1) return t;

          const newItems = [...t.items];
          newItems[itemIndex] = firstItem;
          newItems.splice(itemIndex + 1, 0, secondItem);

          return { ...t, items: newItems };
        }
        return t;
      }));

      setSelectedItemId(itemId);
    }
    // Handle subtitle items
    else if (item.subtitleId) {
      const subtitle = subtitles.find(s => s.id === item.subtitleId);
      if (!subtitle) return;

      const firstItemDuration = splitOffset;
      const secondItemStart = itemStart + splitOffset;
      const secondItemDuration = (item.duration || 0) - splitOffset;

      // Create second subtitle
      const secondSubtitle = {
        ...subtitle,
        id: Date.now() + Math.random(),
        startTime: secondItemStart,
        endTime: secondItemStart + secondItemDuration
      };

      // Update first subtitle endTime
      const firstSubtitle = {
        ...subtitle,
        endTime: itemStart + firstItemDuration
      };

      // Update subtitles array
      setSubtitles(prev => {
        const index = prev.findIndex(s => s.id === item.subtitleId);
        const newSubtitles = [...prev];
        newSubtitles[index] = firstSubtitle;
        newSubtitles.splice(index + 1, 0, secondSubtitle);
        return newSubtitles;
      });

      // Update timeline items
      setTracks(prevTracks => prevTracks.map(t => {
        if (t.id === trackId) {
          const itemIndex = t.items.findIndex(i => i.id === itemId);
          if (itemIndex === -1) return t;

          // First item (keep original id, update duration)
          const firstItem = {
            ...item,
            duration: firstItemDuration
          };

          // Second item (new id, new startTime and subtitleId)
          const secondItem = {
            ...item,
            id: `subtitle-item-${secondSubtitle.id}`,
            subtitleId: secondSubtitle.id,
            startTime: secondItemStart,
            duration: secondItemDuration,
            text: subtitle.text
          };

          const newItems = [...t.items];
          newItems[itemIndex] = firstItem;
          newItems.splice(itemIndex + 1, 0, secondItem);

          return { ...t, items: newItems };
        }
        return t;
      }));

      setSelectedItemId(itemId);
    }
  };

  // Calculate total timeline duration from all tracks - improved for better UX
  const getTimelineDuration = () => {
    let maxEnd = 0;
    tracks.forEach(track => {
      if (!track.visible) return; // Skip hidden tracks
      track.items.forEach(item => {
        const itemStart = item.startTime || 0;
        const itemDuration = item.duration || 0;
        const itemEnd = itemStart + itemDuration;
        if (itemEnd > maxEnd) maxEnd = itemEnd;
      });
    });
    // Also check clips for duration
    clips.forEach(clip => {
      const clipStart = clip.startTime || 0;
      const clipDuration = clip.originalDuration || clip.endTime || 0;
      const clipEnd = clipStart + clipDuration;
      if (clipEnd > maxEnd) maxEnd = clipEnd;
    });
    // Ensure minimum duration for empty timeline (30 seconds default for better UX)
    return Math.max(maxEnd, 30);
  };

  // Clip management functions
  const addClip = async (file) => {
    if (!file || !file.type.startsWith('video/')) return;
    
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url;
    
    return new Promise((resolve) => {
      video.onloadedmetadata = () => {
        const clip = {
          id: Date.now() + Math.random(),
          file: file,
          url: url,
          originalDuration: video.duration,
          startTime: 0,
          endTime: video.duration,
          filters: {
            brightness: 100,
            contrast: 100,
            saturation: 100,
            hue: 0,
            blur: 0,
            sepia: 0,
            grayscale: 0
          },
          zoom: 100,
          speed: 1.0, // 0.25x to 4x
          rotation: 0, // 0, 90, 180, 270
          flipHorizontal: false,
          flipVertical: false,
          crop: {
            enabled: false,
            x: 0,
            y: 0,
            width: 100,
            height: 100
          },
          muted: false,
          reversed: false,
          subtitles: []
        };
        
        setClips(prev => {
          const newClips = [...prev, clip];
          // Always select the newly added clip
          setSelectedClipId(clip.id);
          // Always update video preview to show the newly added clip
          setVideoFile(file);
          setVideoUrl(url);
          setStartTime(clip.startTime);
          setEndTime(clip.endTime);
          setDuration(video.duration);
          setOriginalDuration(video.duration);
          setFilters(clip.filters);
          setZoom(clip.zoom);
          return newClips;
        });

        // Also add to video track - use functional update to ensure we get latest state
        setTracks(prevTracks => {
          const videoTrack = prevTracks.find(t => t.type === 'video');
          if (videoTrack) {
            // Calculate timeline duration from current tracks BEFORE adding new item
            let maxEnd = 0;
            prevTracks.forEach(t => {
              t.items.forEach(item => {
                const itemEnd = (item.startTime || 0) + (item.duration || 0);
                if (itemEnd > maxEnd) maxEnd = itemEnd;
              });
            });
            
            // If no items exist, start at 0, otherwise add at the end
            const startTime = maxEnd > 0 ? maxEnd : 0;
            
            // Calculate trimmed duration from clip's startTime and endTime
            const trimmedDuration = (clip.endTime || video.duration) - (clip.startTime || 0);
            
            const timelineItem = {
              id: `item-${Date.now()}-${Math.random()}`,
              type: 'video',
              clipId: clip.id,
              startTime: startTime,
              duration: trimmedDuration, // Use trimmed duration, not original video duration
              file: file,
              url: url,
              originalDuration: video.duration,
              endTime: clip.endTime || video.duration,
              filters: { ...clip.filters },
              zoom: clip.zoom,
              speed: clip.speed,
              rotation: clip.rotation,
              flipHorizontal: clip.flipHorizontal,
              flipVertical: clip.flipVertical,
              crop: { ...clip.crop },
              muted: clip.muted,
              reversed: clip.reversed
            };
            
            const updatedTracks = prevTracks.map(track => {
              if (track.id === videoTrack.id) {
                return { ...track, items: [...track.items, timelineItem] };
              }
              return track;
            });
            
            // Ensure the item is visible by selecting it
            setSelectedItemId(timelineItem.id);
            setSelectedTrackId(videoTrack.id);
            
            return updatedTracks;
          }
          return prevTracks;
        });
        
        resolve(clip);
      };
    });
  };

  const removeClip = (clipId) => {
    setClips(prev => {
      const newClips = prev.filter(c => c.id !== clipId);
      const removedClip = prev.find(c => c.id === clipId);
      
      // Revoke URL to free memory
      if (removedClip && removedClip.url) {
        URL.revokeObjectURL(removedClip.url);
      }
      
      // Remove timeline items associated with this clip
      setTracks(prevTracks => prevTracks.map(track => ({
        ...track,
        items: track.items.filter(item => item.clipId !== clipId)
      })));
      
      // Remove subtitles that belong to this clip
      if (removedClip && removedClip.subtitles) {
        const subtitleIdsToRemove = removedClip.subtitles.map(sub => sub.id);
        setSubtitles(prev => prev.filter(sub => !subtitleIdsToRemove.includes(sub.id)));
        
        // Also remove subtitle timeline items
        setTracks(prevTracks => prevTracks.map(track => {
          if (track.type === 'subtitle') {
            return {
              ...track,
              items: track.items.filter(item => 
                !item.subtitleId || !subtitleIdsToRemove.includes(item.subtitleId)
              )
            };
          }
          return track;
        }));
      }
      
      // Update selected clip
      if (selectedClipId === clipId) {
        if (newClips.length > 0) {
          setSelectedClipId(newClips[0].id);
          const firstClip = newClips[0];
          setVideoFile(firstClip.file);
          setVideoUrl(firstClip.url);
          setStartTime(firstClip.startTime);
          setEndTime(firstClip.endTime);
          setDuration(firstClip.originalDuration);
          setOriginalDuration(firstClip.originalDuration);
          setFilters(firstClip.filters);
          setZoom(firstClip.zoom);
          setSubtitles(firstClip.subtitles);
        } else {
          setSelectedClipId(null);
          setVideoFile(null);
          setVideoUrl(null);
          setStartTime(0);
          setEndTime(0);
          setDuration(0);
          setOriginalDuration(0);
        }
      }
      
      return newClips;
    });
  };

  const selectClip = (clipId) => {
    const clip = clips.find(c => c.id === clipId);
    if (clip) {
      setSelectedClipId(clipId);
      setVideoFile(clip.file);
      setVideoUrl(clip.url);
      setStartTime(clip.startTime);
      setEndTime(clip.endTime);
      setDuration(clip.originalDuration);
      setOriginalDuration(clip.originalDuration);
      setFilters(clip.filters || { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, sepia: 0, grayscale: 0 });
      setZoom(clip.zoom || 100);
      setSpeed(clip.speed || 1.0);
      setRotation(clip.rotation || 0);
      setFlipHorizontal(clip.flipHorizontal || false);
      setFlipVertical(clip.flipVertical || false);
      setCrop(clip.crop || { enabled: false, x: 0, y: 0, width: 100, height: 100 });
      setMuted(clip.muted || false);
      setReversed(clip.reversed || false);
      setSubtitles(clip.subtitles || []);
      
      // Update video element to show selected clip
      // The useEffect hook will handle the actual video source update
      // But we ensure videoUrl is set so the useEffect triggers
      if (!previewUrl) {
        // Force update by ensuring videoUrl is set
        // The useEffect will detect the change and update the video element
      }
    }
  };

  const updateClip = (clipId, updates) => {
    setClips(prev => prev.map(clip => {
      if (clip.id === clipId) {
        const updated = { ...clip, ...updates };
        // If this is the selected clip, update legacy state
        if (selectedClipId === clipId) {
          if (updates.startTime !== undefined) setStartTime(updates.startTime);
          if (updates.endTime !== undefined) setEndTime(updates.endTime);
          if (updates.filters !== undefined) setFilters(updates.filters);
          if (updates.zoom !== undefined) setZoom(updates.zoom);
          if (updates.subtitles !== undefined) setSubtitles(updates.subtitles);
        }
        return updated;
      }
      return clip;
    }));
  };

  // Calculate total timeline duration from all clips
  const getTotalTimelineDuration = () => {
    return clips.reduce((total, clip) => {
      return total + (clip.endTime - clip.startTime);
    }, 0);
  };

  // Get clip at a specific timeline position
  const getClipAtTimelinePosition = (timelineTime) => {
    let accumulated = 0;
    for (const clip of clips) {
      const clipDuration = clip.endTime - clip.startTime;
      if (timelineTime >= accumulated && timelineTime <= accumulated + clipDuration) {
        return {
          clip,
          localTime: timelineTime - accumulated + clip.startTime,
          timelineTime: accumulated
        };
      }
      accumulated += clipDuration;
    }
    return null;
  };

  // Timeline drag handlers
  const getTimelinePosition = (e) => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    return percentage * (originalDuration || duration);
  };

  const handleTimelineMouseDown = (e, type) => {
    e.preventDefault();
    setDragging(type);
    const time = getTimelinePosition(e);
    const maxTime = originalDuration || duration;
    
    if (type === 'start') {
      const newStart = Math.max(0, Math.min(time, endTime - 0.1));
      setStartTime(newStart);
      if (videoRef.current) {
        // Adjust currentTime for preview video (relative to preview start)
        if (previewUrl) {
          videoRef.current.currentTime = Math.max(0, newStart - startTime);
        } else {
          videoRef.current.currentTime = newStart;
        }
      }
    } else if (type === 'end') {
      const newEnd = Math.min(maxTime, Math.max(time, startTime + 0.1));
      setEndTime(newEnd);
      if (videoRef.current) {
        // Adjust currentTime for preview video (relative to preview start)
        if (previewUrl) {
          videoRef.current.currentTime = Math.min(duration, newEnd - startTime);
        } else {
          videoRef.current.currentTime = newEnd;
        }
      }
    } else if (type === 'playhead') {
      const newTime = Math.max(0, Math.min(time, maxTime));
      setCurrentTime(newTime);
      if (videoRef.current) {
        // Adjust currentTime for preview video (relative to preview start)
        if (previewUrl) {
          videoRef.current.currentTime = Math.max(0, Math.min(duration, newTime - startTime));
        } else {
          videoRef.current.currentTime = newTime;
        }
      }
    }
  };

  useEffect(() => {
    const handleTimelineMouseMove = (e) => {
      if (!dragging && !isDraggingSubtitle && !isClickingTimeline) return;
      if (!timelineRef.current) return;
      
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      const time = percentage * (originalDuration || duration);
      
      // If user started clicking timeline and moved mouse, start subtitle drag
      if (isClickingTimeline && timelineClickStart) {
        const dragDistance = Math.abs(e.clientX - timelineClickStart.x) + Math.abs(e.clientY - timelineClickStart.y);
        if (dragDistance > 5) { // If moved more than 5 pixels, treat as drag
          setIsClickingTimeline(false);
          setIsDraggingSubtitle(true);
        }
      }
      
      if (isDraggingSubtitle) {
        // Update subtitle drag end time - constrain to trimmed range
        if (subtitleDragStart !== null) {
          const constrainedTime = Math.max(startTime, Math.min(time, endTime));
          setCurrentTime(constrainedTime);
          if (videoRef.current) {
            videoRef.current.currentTime = constrainedTime;
          }
        }
        return;
      }
      
      if (dragging === 'start') {
        const maxTime = originalDuration || duration;
        const newStart = Math.max(0, Math.min(time, endTime - 0.1));
        setStartTime(newStart);
        if (videoRef.current) {
          // Adjust currentTime for preview video (relative to preview start)
          if (previewUrl) {
            videoRef.current.currentTime = Math.max(0, newStart - startTime);
          } else {
            videoRef.current.currentTime = newStart;
          }
        }
      } else if (dragging === 'end') {
        const maxTime = originalDuration || duration;
        const newEnd = Math.min(maxTime, Math.max(time, startTime + 0.1));
        setEndTime(newEnd);
        if (videoRef.current) {
          // Adjust currentTime for preview video (relative to preview start)
          if (previewUrl) {
            videoRef.current.currentTime = Math.min(duration, newEnd - startTime);
          } else {
            videoRef.current.currentTime = newEnd;
          }
        }
      } else if (dragging === 'playhead') {
        const maxTime = originalDuration || duration;
        const newTime = Math.max(0, Math.min(time, maxTime));
        setCurrentTime(newTime);
        if (videoRef.current) {
          // Adjust currentTime for preview video (relative to preview start)
          if (previewUrl) {
            videoRef.current.currentTime = Math.max(0, Math.min(duration, newTime - startTime));
          } else {
            videoRef.current.currentTime = newTime;
          }
        }
      }
    };

    const handleTimelineMouseUp = (e) => {
      // Handle subtitle drag completion
      if (isDraggingSubtitle && subtitleDragStart !== null) {
        if (!timelineRef.current) {
          setIsDraggingSubtitle(false);
          setSubtitleDragStart(null);
          setIsClickingTimeline(false);
          setTimelineClickStart(null);
          return;
        }
        
        const rect = timelineRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        const dragEnd = percentage * (originalDuration || duration);
        
        // Constrain both start and end to trimmed range
        const dragStart = Math.max(startTime, Math.min(Math.min(subtitleDragStart, dragEnd), endTime - 0.1));
        const dragEndTime = Math.min(endTime, Math.max(Math.max(subtitleDragStart, dragEnd), dragStart + 0.1));
        
        // Create subtitle from drag (only if within trimmed range and has valid duration)
        if (dragStart >= startTime && dragEndTime <= endTime && Math.abs(dragEndTime - dragStart) > 0.1) {
          const newSubtitle = {
            id: Date.now(),
            text: '',
            startTime: dragStart,
            endTime: dragEndTime,
            position: 'bottom'
          };
          setSubtitles([...subtitles, newSubtitle]);
          setEditingSubtitle(newSubtitle.id);
        }
        
        setIsDraggingSubtitle(false);
        setSubtitleDragStart(null);
        setIsClickingTimeline(false);
        setTimelineClickStart(null);
      } else if (isClickingTimeline && timelineClickStart) {
        // If it was just a click (no drag), add subtitle at that position
        const time = timelineClickStart.time;
        const constrainedStart = Math.max(startTime, Math.min(time, endTime - 0.1));
        const constrainedEnd = Math.min(endTime, constrainedStart + 3);
        
        // Add subtitle at clicked position
        const newSubtitle = {
          id: Date.now(),
          text: '',
          startTime: constrainedStart,
          endTime: constrainedEnd,
          position: 'bottom'
        };
        setSubtitles([...subtitles, newSubtitle]);
        setEditingSubtitle(newSubtitle.id);
        setCurrentTime(constrainedStart);
        if (videoRef.current) {
          videoRef.current.currentTime = constrainedStart;
        }
        
        setIsClickingTimeline(false);
        setTimelineClickStart(null);
        setSubtitleDragStart(null);
      }
      
      if (dragging) {
        setDragging(null);
      }
    };

    if (dragging || isDraggingSubtitle || isClickingTimeline) {
      document.addEventListener('mousemove', handleTimelineMouseMove);
      document.addEventListener('mouseup', handleTimelineMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleTimelineMouseMove);
        document.removeEventListener('mouseup', handleTimelineMouseUp);
      };
    }
  }, [dragging, isDraggingSubtitle, isClickingTimeline, subtitleDragStart, timelineClickStart, duration, startTime, endTime, subtitles]);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 10, 200));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 10, 50));
  };

  const handleResetZoom = () => {
    setZoom(100);
  };

  const addSubtitle = () => {
    // Constrain subtitle times to trimmed range
    const constrainedStart = Math.max(startTime, Math.min(currentTime, endTime - 0.1));
    const constrainedEnd = Math.min(endTime, Math.max(constrainedStart + 0.1, Math.min(currentTime + 3, endTime)));
    
    const newSubtitle = {
      id: Date.now(),
      text: '',
      startTime: constrainedStart,
      endTime: constrainedEnd,
      position: 'bottom'
    };
    setSubtitles([...subtitles, newSubtitle]);
    setEditingSubtitle(newSubtitle.id);
    
    // Also add to subtitle track
    setTracks(prevTracks => {
      const subtitleTrack = prevTracks.find(t => t.type === 'subtitle');
      if (subtitleTrack) {
        const timelineItem = {
          id: `subtitle-item-${newSubtitle.id}`,
          type: 'subtitle',
          subtitleId: newSubtitle.id,
          startTime: constrainedStart,
          duration: constrainedEnd - constrainedStart,
          text: '',
          ...newSubtitle
        };
        
        return prevTracks.map(track => {
          if (track.id === subtitleTrack.id) {
            return { ...track, items: [...track.items, timelineItem] };
          }
          return track;
        });
      }
      return prevTracks;
    });
  };

  const updateSubtitle = (id, field, value) => {
    // Use functional update to get latest subtitle state
    setSubtitles(prevSubtitles => {
      const updatedSubtitles = prevSubtitles.map(sub => 
        sub.id === id ? { ...sub, [field]: value } : sub
      );
      
      // Also update in subtitle track
      setTracks(prevTracks => prevTracks.map(track => {
        if (track.type === 'subtitle') {
          return {
            ...track,
            items: track.items.map(item => {
              if (item.subtitleId === id) {
                const subtitle = updatedSubtitles.find(s => s.id === id);
                const updatedItem = { 
                  ...item, 
                  [field]: value, 
                  text: field === 'text' ? value : (subtitle?.text || item.text) 
                };
                
                // If startTime or endTime changed, update duration
                if (field === 'startTime' || field === 'endTime') {
                  if (subtitle) {
                    const newStartTime = subtitle.startTime || item.startTime || 0;
                    const newEndTime = subtitle.endTime || item.endTime || 0;
                    updatedItem.startTime = newStartTime;
                    updatedItem.duration = Math.max(0.1, newEndTime - newStartTime);
                  }
                }
                
                return updatedItem;
              }
              return item;
            })
          };
        }
        return track;
      }));
      
      return updatedSubtitles;
    });
    
    // Auto-link subtitle to video items that overlap with it (using functional update to get latest state)
    if (field === 'startTime' || field === 'endTime') {
      setSubtitles(prevSubtitles => {
        const subtitle = prevSubtitles.find(s => s.id === id);
        if (subtitle) {
          const newStartTime = field === 'startTime' ? value : subtitle.startTime;
          const newEndTime = field === 'endTime' ? value : subtitle.endTime;
          
          // Find video items that overlap with this subtitle's timeline position
          setTracks(prevTracks => {
            const videoTrack = prevTracks.find(t => t.type === 'video');
            if (videoTrack) {
              const overlappingItems = videoTrack.items.filter(item => {
                const itemStart = item.startTime || 0;
                const itemEnd = itemStart + (item.duration || 0);
                return (newStartTime < itemEnd && newEndTime > itemStart);
              });
              
              // If subtitle overlaps with a video item, link it to that clip
              if (overlappingItems.length > 0) {
                overlappingItems.forEach(item => {
                  if (item.clipId) {
                    setClips(prevClips => {
                      const clip = prevClips.find(c => c.id === item.clipId);
                      if (clip) {
                        const updatedSubtitle = { ...subtitle, startTime: newStartTime, endTime: newEndTime };
                        // Convert timeline time to clip-relative time
                        const clipStart = item.startTime || 0;
                        const clipRelativeStart = Math.max(0, newStartTime - clipStart);
                        const clipRelativeEnd = Math.min(item.duration || 0, newEndTime - clipStart);
                        
                        // Check if subtitle already exists in clip (by id)
                        const existingIndex = (clip.subtitles || []).findIndex(s => s.id === id);
                        if (existingIndex >= 0) {
                          // Update existing subtitle
                          const updatedSubtitles = [...(clip.subtitles || [])];
                          updatedSubtitles[existingIndex] = {
                            ...updatedSubtitle,
                            startTime: clipRelativeStart,
                            endTime: clipRelativeEnd
                          };
                          return prevClips.map(c => 
                            c.id === item.clipId 
                              ? { ...c, subtitles: updatedSubtitles }
                              : c
                          );
                        } else {
                          // Add new subtitle to clip
                          return prevClips.map(c => 
                            c.id === item.clipId 
                              ? { 
                                  ...c, 
                                  subtitles: [...(c.subtitles || []), {
                                    ...updatedSubtitle,
                                    startTime: clipRelativeStart,
                                    endTime: clipRelativeEnd
                                  }]
                                }
                              : c
                          );
                        }
                      }
                      return prevClips;
                    });
                  }
                });
              }
            }
            return prevTracks;
          });
        }
        return prevSubtitles;
      });
    }
  };

  const deleteSubtitle = (id) => {
    setSubtitles(subtitles.filter(sub => sub.id !== id));
    if (editingSubtitle === id) {
      setEditingSubtitle(null);
    }
    
    // Also remove from subtitle track
    setTracks(prevTracks => prevTracks.map(track => {
      if (track.type === 'subtitle') {
        return {
          ...track,
          items: track.items.filter(item => item.subtitleId !== id)
        };
      }
      return track;
    }));
  };

  const handleTrim = async () => {
    if (clips.length === 0) {
      alert('Please add at least one video clip');
      return;
    }

    // Validate and fix all clips before processing
    const validClips = clips.map((clip, index) => {
      const originalDur = clip.originalDuration || 0;
      let validStartTime = Math.max(0, Math.min(clip.startTime || 0, originalDur));
      let validEndTime = Math.max(validStartTime + 0.001, Math.min(clip.endTime || originalDur, originalDur)); // 0.001s minimum to prevent invalid state
      
      // If startTime >= endTime, fix it
      if (validStartTime >= validEndTime) {
        // Default to full video if invalid
        validStartTime = 0;
        validEndTime = originalDur;
      }
      
      return {
        ...clip,
        startTime: validStartTime,
        endTime: validEndTime
      };
    });
    
    // Update clips with valid values
    setClips(validClips);
    
    // Final validation check
    for (const clip of validClips) {
      if (clip.startTime >= clip.endTime || clip.endTime > clip.originalDuration) {
        alert(`Clip ${validClips.indexOf(clip) + 1} has invalid trim values. Please adjust the trim handles.`);
        setIsProcessing(false);
        return;
      }
    }

    setIsProcessing(true);
    
    // If multiple clips, use the new multi-clip endpoint
    if (validClips.length > 1) {
    const formData = new FormData();
      
      // Get all video items from timeline tracks, sorted by timeline position
      const videoItems = [];
      tracks.forEach(track => {
        if (track.type === 'video' && track.visible) {
          track.items.forEach(item => {
            if (item.clipId) {
              videoItems.push(item);
            }
          });
        }
      });
      
      // Sort items by their timeline position (startTime on timeline)
      videoItems.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
      
      // Get clips in timeline order
      const orderedClips = videoItems.map(item => {
        return validClips.find(clip => clip.id === item.clipId);
      }).filter(clip => clip !== undefined); // Remove any undefined clips
      
      if (orderedClips.length === 0) {
        alert('No valid clips found in timeline');
        setIsProcessing(false);
        return;
      }
      
      // Collect all subtitles from subtitle tracks
      const allSubtitleItems = [];
      tracks.forEach(track => {
        if (track.type === 'subtitle' && track.visible) {
          track.items.forEach(item => {
            if (item.subtitleId) {
              const subtitle = subtitles.find(s => s.id === item.subtitleId);
              if (subtitle && subtitle.text && subtitle.text.trim().length > 0) {
                allSubtitleItems.push({
                  ...subtitle,
                  timelineStartTime: item.startTime || 0,
                  timelineEndTime: (item.startTime || 0) + (item.duration || 0)
                });
              }
            }
          });
        }
      });
      
      // Send all clips data in timeline order
      const clipsData = orderedClips.map((clip) => {
        // Find the timeline item for this clip to get its timeline position
        const clipTimelineItem = videoItems.find(item => item.clipId === clip.id);
        const clipTimelineStart = clipTimelineItem?.startTime || 0;
        const clipTimelineEnd = clipTimelineStart + (clipTimelineItem?.duration || 0);
        
        // Collect subtitles that belong to this clip
        // 1. Subtitles from the clip itself
        const clipSubtitles = clip.subtitles.filter(sub => sub.text && sub.text.trim().length > 0);
        
        // 2. Subtitles from subtitle track that overlap with this clip's timeline position
        const timelineSubtitles = allSubtitleItems
          .filter(subItem => {
            // Check if subtitle overlaps with this clip's timeline position
            const subStart = subItem.timelineStartTime;
            const subEnd = subItem.timelineEndTime;
            return (subStart < clipTimelineEnd && subEnd > clipTimelineStart);
          })
          .map(subItem => {
            // Adjust subtitle times to be relative to the clip's original video time
            const overlapStart = Math.max(subItem.timelineStartTime, clipTimelineStart);
            const overlapEnd = Math.min(subItem.timelineEndTime, clipTimelineEnd);
            
            // Calculate how much of the subtitle overlaps with this clip
            const timelineOverlapStart = overlapStart - clipTimelineStart;
            const timelineOverlapEnd = overlapEnd - clipTimelineStart;
            
            // Map timeline overlap to clip's local time
            const clipTrimStart = clip.startTime || 0;
            const clipTrimEnd = clip.endTime || clip.originalDuration || 0;
            const clipTrimDuration = clipTrimEnd - clipTrimStart;
            const clipTimelineDuration = clipTimelineEnd - clipTimelineStart;
            
            // Calculate the subtitle's start and end times in the clip's local time
            const clipLocalStart = clipTimelineDuration > 0 
              ? clipTrimStart + (timelineOverlapStart / clipTimelineDuration) * clipTrimDuration
              : clipTrimStart;
            const clipLocalEnd = clipTimelineDuration > 0
              ? clipTrimStart + (timelineOverlapEnd / clipTimelineDuration) * clipTrimDuration
              : clipTrimEnd;
            
            return {
              text: subItem.text,
              position: subItem.position || 'bottom',
              startTime: clipLocalStart,
              endTime: clipLocalEnd
            };
          });
        
        // Combine clip subtitles and timeline subtitles
        const allSubtitlesForClip = [...clipSubtitles, ...timelineSubtitles];
        
        return {
          startTime: clip.startTime,
          endTime: clip.endTime,
          brightness: clip.filters?.brightness || 100,
          contrast: clip.filters?.contrast || 100,
          saturation: clip.filters?.saturation || 100,
          hue: clip.filters?.hue || 0,
          blur: clip.filters?.blur || 0,
          sepia: clip.filters?.sepia || 0,
          grayscale: clip.filters?.grayscale || 0,
          zoom: clip.zoom || 100,
          speed: clip.speed || 1.0,
          rotation: clip.rotation || 0,
          flipHorizontal: clip.flipHorizontal || false,
          flipVertical: clip.flipVertical || false,
          crop: clip.crop || { enabled: false, x: 0, y: 0, width: 100, height: 100 },
          muted: clip.muted || false,
          reversed: clip.reversed || false,
          subtitles: allSubtitlesForClip
        };
      });
      
      formData.append('clips_data', JSON.stringify(clipsData));
      
      // Send all video files in timeline order
      orderedClips.forEach((clip, index) => {
        formData.append(`video_${index}`, clip.file);
      });
      
      if (backgroundAudio) {
        formData.append('background_audio', backgroundAudio);
      }
      formData.append('background_audio_volume', backgroundAudioVolume);

      try {
        const response = await axios.post('http://localhost:5001/api/process-multiple-clips', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          responseType: 'blob',
        });

        const url = window.URL.createObjectURL(new Blob([response.data]));
        setDownloadUrl(url);
        setIsProcessing(false);
      } catch (error) {
        console.error('Error processing multiple clips:', error);
        alert('Error processing video clips. Please try again.');
        setIsProcessing(false);
      }
    } else {
      // Single clip - use existing endpoint
      const clip = validClips[0];
      const formData = new FormData();
      formData.append('video', clip.file);
      formData.append('start_time', clip.startTime);
      formData.append('end_time', clip.endTime);
      formData.append('brightness', clip.filters?.brightness || 100);
      formData.append('contrast', clip.filters?.contrast || 100);
      formData.append('saturation', clip.filters?.saturation || 100);
      formData.append('hue', clip.filters?.hue || 0);
      formData.append('blur', clip.filters?.blur || 0);
      formData.append('sepia', clip.filters?.sepia || 0);
      formData.append('grayscale', clip.filters?.grayscale || 0);
      formData.append('zoom', clip.zoom || 100);
      formData.append('speed', clip.speed || 1.0);
      formData.append('rotation', clip.rotation || 0);
      formData.append('flip_horizontal', clip.flipHorizontal || false);
      formData.append('flip_vertical', clip.flipVertical || false);
      formData.append('crop', JSON.stringify(clip.crop || { enabled: false, x: 0, y: 0, width: 100, height: 100 }));
      formData.append('muted', clip.muted || false);
      formData.append('reversed', clip.reversed || false);
    // Filter out subtitles with empty text
      const validSubtitles = clip.subtitles.filter(sub => sub.text && sub.text.trim().length > 0);
    console.log('Sending subtitles:', validSubtitles);
    formData.append('subtitles', JSON.stringify(validSubtitles));
    if (backgroundAudio) {
      formData.append('background_audio', backgroundAudio);
    }
    formData.append('background_audio_volume', backgroundAudioVolume);

    try {
      const response = await axios.post('http://localhost:5001/api/process-video', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      setDownloadUrl(url);
      setIsProcessing(false);
    } catch (error) {
      console.error('Error processing video:', error);
      alert('Error processing video. Please try again.');
      setIsProcessing(false);
      }
    }
  };

  const handleDownload = () => {
    if (downloadUrl) {
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = 'edited-video.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handlePreview = useCallback(async () => {
    if (clips.length === 0) {
      alert('Please add at least one video clip first');
      return;
    }

    setIsGeneratingPreview(true);
    
    // If multiple clips, use the multi-clip preview endpoint
    if (clips.length > 1) {
      const formData = new FormData();
      
      // Get all video items from timeline tracks, sorted by timeline position
      const videoItems = [];
      tracks.forEach(track => {
        if (track.type === 'video' && track.visible) {
          track.items.forEach(item => {
            if (item.clipId) {
              videoItems.push(item);
            }
          });
        }
      });
      
      // Sort items by their timeline position (startTime on timeline)
      videoItems.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
      
      // Get clips in timeline order
      const orderedClips = videoItems.map(item => {
        return clips.find(clip => clip.id === item.clipId);
      }).filter(clip => clip !== undefined);
      
      if (orderedClips.length === 0) {
        alert('No valid clips found in timeline');
        setIsGeneratingPreview(false);
        return;
      }
      
      // Collect all subtitles from subtitle tracks
      const allSubtitleItems = [];
      tracks.forEach(track => {
        if (track.type === 'subtitle' && track.visible) {
          track.items.forEach(item => {
            if (item.subtitleId) {
              const subtitle = subtitles.find(s => s.id === item.subtitleId);
              if (subtitle && subtitle.text && subtitle.text.trim().length > 0) {
                allSubtitleItems.push({
                  ...subtitle,
                  timelineStartTime: item.startTime || 0,
                  timelineEndTime: (item.startTime || 0) + (item.duration || 0)
                });
              }
            }
          });
        }
      });
      
      // Send all clips data in timeline order
      const clipsData = orderedClips.map((clip) => {
        // Find the timeline item for this clip to get its timeline position
        const clipTimelineItem = videoItems.find(item => item.clipId === clip.id);
        const clipTimelineStart = clipTimelineItem?.startTime || 0;
        const clipTimelineEnd = clipTimelineStart + (clipTimelineItem?.duration || 0);
        
        // Collect subtitles that belong to this clip
        // 1. Subtitles from the clip itself
        const clipSubtitles = clip.subtitles.filter(sub => sub.text && sub.text.trim().length > 0);
        
        // 2. Subtitles from subtitle track that overlap with this clip's timeline position
        const timelineSubtitles = allSubtitleItems
          .filter(subItem => {
            // Check if subtitle overlaps with this clip's timeline position
            const subStart = subItem.timelineStartTime;
            const subEnd = subItem.timelineEndTime;
            return (subStart < clipTimelineEnd && subEnd > clipTimelineStart);
          })
          .map(subItem => {
            // Adjust subtitle times to be relative to the clip's original video time
            const overlapStart = Math.max(subItem.timelineStartTime, clipTimelineStart);
            const overlapEnd = Math.min(subItem.timelineEndTime, clipTimelineEnd);
            
            // Calculate how much of the subtitle overlaps with this clip
            const timelineOverlapStart = overlapStart - clipTimelineStart;
            const timelineOverlapEnd = overlapEnd - clipTimelineStart;
            
            // Map timeline overlap to clip's local time
            const clipTrimStart = clip.startTime || 0;
            const clipTrimEnd = clip.endTime || clip.originalDuration || 0;
            const clipTrimDuration = clipTrimEnd - clipTrimStart;
            const clipTimelineDuration = clipTimelineEnd - clipTimelineStart;
            
            // Calculate the subtitle's start and end times in the clip's local time
            const clipLocalStart = clipTimelineDuration > 0 
              ? clipTrimStart + (timelineOverlapStart / clipTimelineDuration) * clipTrimDuration
              : clipTrimStart;
            const clipLocalEnd = clipTimelineDuration > 0
              ? clipTrimStart + (timelineOverlapEnd / clipTimelineDuration) * clipTrimDuration
              : clipTrimEnd;
            
            return {
              text: subItem.text,
              position: subItem.position || 'bottom',
              startTime: clipLocalStart,
              endTime: clipLocalEnd
            };
          });
        
        // Combine clip subtitles and timeline subtitles
        const allSubtitlesForClip = [...clipSubtitles, ...timelineSubtitles];
        
        return {
          startTime: clip.startTime,
          endTime: clip.endTime,
          brightness: clip.filters?.brightness || 100,
          contrast: clip.filters?.contrast || 100,
          saturation: clip.filters?.saturation || 100,
          hue: clip.filters?.hue || 0,
          blur: clip.filters?.blur || 0,
          sepia: clip.filters?.sepia || 0,
          grayscale: clip.filters?.grayscale || 0,
          zoom: clip.zoom || 100,
          speed: clip.speed || 1.0,
          rotation: clip.rotation || 0,
          flipHorizontal: clip.flipHorizontal || false,
          flipVertical: clip.flipVertical || false,
          crop: clip.crop || { enabled: false, x: 0, y: 0, width: 100, height: 100 },
          muted: clip.muted || false,
          reversed: clip.reversed || false,
          subtitles: allSubtitlesForClip
        };
      });
      
      formData.append('clips_data', JSON.stringify(clipsData));
      
      // Send all video files in timeline order
      orderedClips.forEach((clip, index) => {
        formData.append(`video_${index}`, clip.file);
      });
      
      if (backgroundAudio) {
        formData.append('background_audio', backgroundAudio);
      }
      formData.append('background_audio_volume', backgroundAudioVolume);

      try {
        const response = await axios.post('http://localhost:5001/api/preview-multiple-clips', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          responseType: 'blob',
        });

        const url = window.URL.createObjectURL(new Blob([response.data]));
        // Revoke old preview URL if exists
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
        setPreviewUrl(url);
        setIsGeneratingPreview(false);
        // Update video to show preview
        if (videoRef.current) {
          videoRef.current.src = url;
          videoRef.current.load();
        }
      } catch (error) {
        console.error('Error generating preview:', error);
        alert('Error generating preview. Please try again.');
        setIsGeneratingPreview(false);
      }
    } else {
      // Single clip preview
      const clipToPreview = clips[0];
      const formData = new FormData();
      formData.append('video', clipToPreview.file);
      
      // Use the clip's trim values
      const clipStartTime = clipToPreview.startTime || 0;
      const clipEndTime = clipToPreview.endTime || clipToPreview.originalDuration || 0;
      
      formData.append('start_time', clipStartTime);
      formData.append('end_time', clipEndTime);
      formData.append('brightness', clipToPreview.filters?.brightness || filters.brightness || 100);
      formData.append('contrast', clipToPreview.filters?.contrast || filters.contrast || 100);
      formData.append('saturation', clipToPreview.filters?.saturation || filters.saturation || 100);
      formData.append('zoom', clipToPreview.zoom || zoom || 100);
      
      // Use clip's subtitles or global subtitles
      const clipSubtitles = clipToPreview.subtitles || subtitles;
      const validSubtitles = clipSubtitles.filter(sub => sub.text && sub.text.trim().length > 0);
      console.log('Sending subtitles for preview:', validSubtitles);
      formData.append('subtitles', JSON.stringify(validSubtitles));

      try {
        const response = await axios.post('http://localhost:5001/api/preview-video', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          responseType: 'blob',
        });

        const url = window.URL.createObjectURL(new Blob([response.data]));
        // Revoke old preview URL if exists
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
        setPreviewUrl(url);
        setIsGeneratingPreview(false);
        // Update video to show preview
        if (videoRef.current) {
          videoRef.current.src = url;
          videoRef.current.load();
        }
      } catch (error) {
        console.error('Error generating preview:', error);
        alert('Error generating preview. Please try again.');
        setIsGeneratingPreview(false);
      }
    }
  }, [clips, tracks, subtitles, filters, zoom, backgroundAudio, backgroundAudioVolume, previewUrl]);

  // Auto-preview effect - debounced preview generation when changes are made
  useEffect(() => {
    if (!autoPreview || clips.length === 0 || isGeneratingPreview) {
      // Clear timer if auto-preview is disabled
      if (previewDebounceTimerRef.current) {
        clearTimeout(previewDebounceTimerRef.current);
        previewDebounceTimerRef.current = null;
      }
      return;
    }

    // Clear existing timer
    if (previewDebounceTimerRef.current) {
      clearTimeout(previewDebounceTimerRef.current);
    }

    // Set new timer to generate preview after 1.5 seconds of no changes
    previewDebounceTimerRef.current = setTimeout(() => {
      handlePreview().catch(err => {
        console.error('Error in auto-preview:', err);
      });
      previewDebounceTimerRef.current = null;
    }, 1500);

    // Cleanup function
    return () => {
      if (previewDebounceTimerRef.current) {
        clearTimeout(previewDebounceTimerRef.current);
        previewDebounceTimerRef.current = null;
      }
    };
  }, [startTime, endTime, filters, zoom, speed, rotation, flipHorizontal, flipVertical, crop, muted, reversed, subtitles, clips, tracks, autoPreview, isGeneratingPreview, handlePreview]);

  return (
    <div className="video-editor-container">
      <h1>🎬 Video Editor & Trimmer</h1>
      
          {!videoUrl ? (
            <div {...getRootProps()} className="dropzone">
              <input {...getInputProps()} />
              {isDragActive ? (
                <p>Drop the video here...</p>
              ) : (
                <div className="dropzone-content">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <p>Drag & drop a video file here, or click to select</p>
                  <p className="dropzone-hint">Supports MP4, MOV, AVI, MKV</p>
                </div>
              )}
            </div>
          ) : (
        <>
          {/* Video Preview Section - Full Width */}
          <div className="video-preview-section-full">
              <div className="video-wrapper">
                <div 
                  className="video-zoom-container"
                  style={{ 
                    transform: `scale(${zoom / 100})`,
                    transformOrigin: 'center',
                    transition: 'transform 0.3s ease',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <video
                    key={selectedClipId || videoUrl || 'default'} // Force remount when clip changes
                    ref={videoRef}
                    src={previewUrl || videoUrl}
                    controls
                    className="video-preview"
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                </div>
              </div>
              <div className="zoom-controls">
                <button onClick={handleZoomOut} className="btn-zoom" title="Zoom Out">
                  ➖
                </button>
                <span className="zoom-level">{zoom}%</span>
                <button onClick={handleZoomIn} className="btn-zoom" title="Zoom In">
                  ➕
                </button>
                <button onClick={handleResetZoom} className="btn-zoom-reset" title="Reset Zoom">
                  🔍
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button 
                onClick={() => {
                    // Clear all clips
                    clips.forEach(clip => {
                      if (clip.url) URL.revokeObjectURL(clip.url);
                    });
                    setClips([]);
                    setSelectedClipId(null);
                  setVideoFile(null);
                  setVideoUrl(null);
                  setDownloadUrl(null);
                    setStartTime(0);
                    setEndTime(0);
                    setDuration(0);
                    setOriginalDuration(0);
                    setZoom(100);
                    setSubtitles([]);
                    setBackgroundAudio(null);
                    setBackgroundAudioVolume(50);
                    if (previewUrl) {
                      URL.revokeObjectURL(previewUrl);
                      setPreviewUrl(null);
                    }
                }}
                className="btn-secondary"
              >
                  Clear All
              </button>
                <div {...getRootProps()} style={{ cursor: 'pointer' }}>
                  <input {...getInputProps()} />
                  <button 
                    type="button"
                    className="btn-success"
                    style={{ margin: 0 }}
                  >
                    ➕ Add Video Clip
                  </button>
                </div>
              </div>
          </div>

          {/* Multi-Track Timeline - Full Width */}
          <div className="multi-track-timeline-container">
            <div className="timeline-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h4>🎬 Multi-Track Timeline</h4>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  color: '#fff'
                }}>
                  <span>Time: {formatTime(currentTime)}</span>
                  <span style={{ opacity: 0.5 }}>/</span>
                  <span>{formatTime(getTimelineDuration())}</span>
                </div>
              </div>
              <div className="timeline-controls">
                <button
                  className="timeline-zoom-btn"
                  onClick={splitAllTracksAtCurrentTime}
                  title="Split all items at current playhead position across all tracks"
                  style={{ 
                    background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                    color: 'white',
                    fontWeight: 'bold'
                  }}
                >
                  ✂️ Split All Tracks
                </button>
                <button
                  className={`timeline-zoom-btn ${snapEnabled ? 'active' : ''}`}
                  onClick={() => setSnapEnabled(!snapEnabled)}
                  title={snapEnabled ? 'Disable Snapping' : 'Enable Snapping'}
                  style={{ 
                    background: snapEnabled ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : undefined,
                    color: snapEnabled ? 'white' : undefined
                  }}
                >
                  {snapEnabled ? '🔗' : '🔓'} Snap
                </button>
                <button
                  className="timeline-zoom-btn"
                  onClick={() => setTimelineZoom(Math.max(0.5, timelineZoom - 0.25))}
                  title="Zoom Out"
                >
                  ➖
                </button>
                <span className="timeline-zoom-level">{Math.round(timelineZoom * 100)}%</span>
                <button
                  className="timeline-zoom-btn"
                  onClick={() => setTimelineZoom(Math.min(4, timelineZoom + 0.25))}
                  title="Zoom In"
                >
                  ➕
                </button>
                <div className="track-type-buttons">
                  <div {...getRootProps()} style={{ display: 'inline-block' }}>
                    <input {...getInputProps()} />
                    <button
                      type="button"
                      className="add-track-btn"
                      title="Add Video to Timeline"
                    >
                      🎬 Add Video
                    </button>
                  </div>
                  <div style={{ display: 'inline-block' }}>
                    <input
                      type="file"
                      accept="audio/*"
                      style={{ display: 'none' }}
                      id="audio-file-input"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file && file.type.startsWith('audio/')) {
                          const audioTrack = tracks.find(t => t.type === 'audio');
                          if (audioTrack) {
                            let placementTime = currentTime;
                            if (placementTime === 0) {
                              let maxEnd = 0;
                              tracks.forEach(t => {
                                t.items.forEach(item => {
                                  const itemEnd = (item.startTime || 0) + (item.duration || 0);
                                  if (itemEnd > maxEnd) maxEnd = itemEnd;
                                });
                              });
                              placementTime = maxEnd;
                            }
                            
                            const url = URL.createObjectURL(file);
                            const audio = document.createElement('audio');
                            audio.src = url;
                            audio.onloadedmetadata = () => {
                              const audioItem = {
                                id: `audio-item-${Date.now()}-${Math.random()}`,
                                type: 'audio',
                                startTime: placementTime,
                                duration: audio.duration,
                                file: file,
                                url: url
                              };
                              addItemToTrack(audioTrack.id, audioItem);
                            };
                          }
                        }
                        e.target.value = ''; // Reset input
                      }}
                    />
                    <button
                      type="button"
                      className="add-track-btn"
                      onClick={() => document.getElementById('audio-file-input')?.click()}
                      title="Add Audio to Timeline"
                    >
                      🎵 Add Audio
                    </button>
                  </div>
                  <button
                    className="add-track-btn"
                    onClick={() => {
                      // Add subtitle at current time
                      const subtitleTrack = tracks.find(t => t.type === 'subtitle');
                      if (subtitleTrack) {
                        const constrainedStart = Math.max(0, currentTime);
                        const constrainedEnd = Math.min(constrainedStart + 3, getTimelineDuration());
                        
                    const newSubtitle = {
                      id: Date.now(),
                      text: '',
                      startTime: constrainedStart,
                      endTime: constrainedEnd,
                      position: 'bottom'
                    };
                    setSubtitles([...subtitles, newSubtitle]);
                    setEditingSubtitle(newSubtitle.id);
                        
                        // Add to subtitle track
                        const timelineItem = {
                          id: `subtitle-item-${newSubtitle.id}`,
                          type: 'subtitle',
                          subtitleId: newSubtitle.id,
                          startTime: constrainedStart,
                          duration: constrainedEnd - constrainedStart,
                          text: ''
                        };
                        addItemToTrack(subtitleTrack.id, timelineItem);
                      }
                    }}
                    title="Add Subtitle at Current Time"
                  >
                    📝 Add Subtitle
                  </button>
                  <button
                    className="add-track-btn"
                    onClick={() => addTrack('video')}
                    title="Add Video Track"
                  >
                    ➕ Video Track
                  </button>
                  <button
                    className="add-track-btn"
                    onClick={() => addTrack('audio')}
                    title="Add Audio Track"
                  >
                    ➕ Audio Track
                  </button>
                  <button
                    className="add-track-btn"
                    onClick={() => addTrack('subtitle')}
                    title="Add Subtitle Track"
                  >
                    ➕ Subtitle Track
                  </button>
                  <button
                    className={`timeline-zoom-btn ${showMinimap ? 'active' : ''}`}
                    onClick={() => setShowMinimap(!showMinimap)}
                    title={showMinimap ? 'Hide Mini-map' : 'Show Mini-map'}
                    style={{ 
                      background: showMinimap ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : undefined,
                      color: showMinimap ? 'white' : undefined
                    }}
                  >
                    {showMinimap ? '🗺️' : '📍'} Map
                  </button>
                </div>
              </div>
                  </div>
                  
            <div 
              className="multi-track-timeline-wrapper"
              onWheel={(e) => {
                // Ctrl + Wheel for zoom, Shift + Wheel for horizontal scroll
                if (e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  const delta = e.deltaY > 0 ? -0.1 : 0.1;
                  setTimelineZoom(prev => Math.max(0.25, Math.min(4, prev + delta)));
                } else if (e.shiftKey) {
                  // Shift + Wheel for horizontal scroll
                  e.preventDefault();
                  const wrapper = e.currentTarget;
                  wrapper.scrollLeft += e.deltaY;
                  setTimelineScrollLeft(wrapper.scrollLeft);
                }
              }}
            >
              {/* Timeline Ruler - positioned after track controls */}
              <div className="timeline-ruler-container">
                <div className="timeline-ruler-spacer"></div>
                <div 
                  className="timeline-ruler"
                  onClick={(e) => {
                    handleTimelineClick(e, e.currentTarget);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {(() => {
                    const duration = getTimelineDuration();
                    const maxTime = Math.ceil(duration);
                    const marks = [];
                    
                    // Create marks with smart intervals based on zoom level
                    let interval = 1; // Default: every second
                    if (timelineZoom >= 2) {
                      interval = 0.5; // Every 0.5 seconds at high zoom
                    } else if (timelineZoom >= 1) {
                      interval = 1; // Every second at normal zoom
                    } else if (timelineZoom >= 0.5) {
                      interval = 5; // Every 5 seconds at low zoom
                    } else {
                      interval = 10; // Every 10 seconds at very low zoom
                    }
                    
                    // Add major marks (every 5 seconds, every minute)
                    for (let i = 0; i <= maxTime; i += interval) {
                      const isMajor = i % 5 === 0; // Every 5 seconds
                      const isMinute = i % 60 === 0; // Every minute
                      const leftPercent = duration > 0 ? (i / duration) * 100 * timelineZoom : 0;
                      
                      marks.push(
                        <div
                          key={i}
                          className={`ruler-mark ${isMinute ? 'ruler-mark-minute' : isMajor ? 'ruler-mark-major' : 'ruler-mark-minor'}`}
                          style={{ left: `${leftPercent}%`, pointerEvents: 'none' }}
                        >
                          {(isMajor || isMinute) && (
                            <span className="ruler-time">{formatTime(i)}</span>
                          )}
                        </div>
                      );
                    }
                    
                    return marks;
                  })()}
                </div>
                  </div>
                  
              {/* Mini-map/Overview */}
              {showMinimap && (
                <div className="timeline-minimap">
                  <div className="minimap-header">
                    <span>Overview</span>
                    <button 
                      className="minimap-close-btn"
                      onClick={() => setShowMinimap(false)}
                      title="Close Mini-map"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="minimap-content">
                    {(() => {
                      const duration = getTimelineDuration();
                      const viewportWidth = 100; // Percentage of timeline visible
                      const viewportLeft = (timelineScrollLeft / (duration * timelineZoom)) * 100;
                      
                      return (
                        <>
                          {tracks.map(track => (
                            <div key={track.id} className="minimap-track">
                              {track.items.map(item => {
                                const itemLeft = duration > 0 ? ((item.startTime || 0) / duration) * 100 : 0;
                                const itemWidth = duration > 0 ? ((item.duration || 0) / duration) * 100 : 0;
                                return (
                                  <div
                                    key={item.id}
                                    className={`minimap-item ${track.type}`}
                                    style={{
                                      left: `${itemLeft}%`,
                                      width: `${itemWidth}%`
                                    }}
                                  />
                                );
                              })}
                            </div>
                          ))}
                          <div 
                            className="minimap-viewport"
                            style={{
                              left: `${Math.max(0, Math.min(viewportLeft, 100 - viewportWidth))}%`,
                              width: `${viewportWidth}%`
                            }}
                          />
                          <div 
                            className="minimap-playhead"
                            style={{
                              left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`
                            }}
                          />
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
                  
              {/* Tracks */}
              <div className="tracks-container" style={{ position: 'relative' }}>
                {/* Global Playhead - spans all tracks, positioned after track controls */}
                {(() => {
                  const duration = getTimelineDuration();
                  const playheadLeft = duration > 0 ? (currentTime / duration) * 100 * timelineZoom : 0;
                  return (
                    <div
                      className="timeline-playhead-multi-global"
                      style={{
                        left: `calc(220px + ${playheadLeft}%)`,
                        cursor: 'grab',
                        position: 'absolute',
                        top: 0,
                        height: '100%',
                        zIndex: 15
                      }}
                    onMouseDown={(e) => {
                        e.preventDefault();
                      e.stopPropagation();
                        const tracksContainer = e.currentTarget.parentElement;
                        const firstTrackContent = tracksContainer.querySelector('.track-content');
                        if (firstTrackContent) {
                          const rect = firstTrackContent.getBoundingClientRect();
                          const startX = e.clientX;
                          const startTime = currentTime;
                          const duration = getTimelineDuration();
                          
                          const handleMouseMove = (moveEvent) => {
                            const deltaX = moveEvent.clientX - startX;
                            const timeDelta = (deltaX / rect.width) * duration / timelineZoom;
                            const newTime = Math.max(0, Math.min(startTime + timeDelta, duration));
                            setCurrentTime(newTime);
                            
                            // Seek video while dragging playhead
                            if (videoRef.current) {
                              // Find clip at new time position
                              let foundClip = null;
                              let clipLocalTime = 0;
                              
                              for (const track of tracks) {
                                if (!track.visible) continue;
                                for (const item of track.items) {
                                  if (item.clipId) {
                                    const itemStart = item.startTime || 0;
                                    const itemEnd = itemStart + (item.duration || 0);
                                    if (newTime >= itemStart && newTime < itemEnd) {
                                      foundClip = clips.find(c => c.id === item.clipId);
                                      if (foundClip) {
                                        clipLocalTime = newTime - itemStart;
                                        break;
                                      }
                                    }
                                  }
                                }
                                if (foundClip) break;
                              }
                              
                              if (foundClip) {
                                videoRef.current.currentTime = Math.max(0, Math.min(clipLocalTime, foundClip.originalDuration || foundClip.endTime || 0));
                              } else if (clips.length > 0) {
                                const firstClip = clips[0];
                                videoRef.current.currentTime = Math.max(0, Math.min(newTime, firstClip.originalDuration || firstClip.endTime || 0));
                              } else {
                                videoRef.current.currentTime = Math.max(0, Math.min(newTime, originalDuration || duration));
                              }
                            }
                          };
                          
                          const handleMouseUp = () => {
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                          };
                          
                          document.addEventListener('mousemove', handleMouseMove);
                          document.addEventListener('mouseup', handleMouseUp);
                        }
                      }}
                    />
                  );
                })()}
                
                {tracks.map((track) => (
                  <div
                    key={track.id}
                    className={`track-row ${selectedTrackId === track.id ? 'selected' : ''} ${!track.visible ? 'hidden' : ''} ${track.collapsed ? 'collapsed' : ''}`}
                    data-track-id={track.id}
                  >
                    {/* Track Controls */}
                    <div className="track-controls">
                      <div className="track-info">
                        <button
                          className="track-collapse-btn"
                          onClick={() => toggleTrackCollapse(track.id)}
                          title={track.collapsed ? 'Expand Track' : 'Collapse Track'}
                        >
                          {track.collapsed ? '▶' : '▼'}
                        </button>
                        <span className="track-type-icon">
                          {track.type === 'video' ? '🎬' : track.type === 'audio' ? '🎵' : '📝'}
                        </span>
                        {editingTrackId === track.id ? (
                          <input
                            type="text"
                            className="track-name-input"
                            value={track.name}
                            autoFocus
                            onBlur={(e) => updateTrackName(track.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                updateTrackName(track.id, e.target.value);
                              } else if (e.key === 'Escape') {
                                setEditingTrackId(null);
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span 
                            className="track-name"
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingTrackId(track.id);
                            }}
                            title="Double-click to rename"
                          >
                            {track.name}
                          </span>
                        )}
                  </div>
                      <div className="track-actions">
                        <button
                          className={`track-action-btn ${track.locked ? 'active' : ''}`}
                          onClick={() => toggleTrackLock(track.id)}
                          title={track.locked ? 'Unlock Track' : 'Lock Track'}
                        >
                          {track.locked ? '🔒' : '🔓'}
                        </button>
                        <button
                          className={`track-action-btn ${track.muted ? 'active' : ''}`}
                          onClick={() => toggleTrackMute(track.id)}
                          title={track.muted ? 'Unmute Track' : 'Mute Track'}
                        >
                          {track.muted ? '🔇' : '🔊'}
                        </button>
                        <button
                          className={`track-action-btn ${!track.visible ? 'active' : ''}`}
                          onClick={() => toggleTrackVisibility(track.id)}
                          title={track.visible ? 'Hide Track' : 'Show Track'}
                        >
                          {track.visible ? '👁️' : '👁️‍🗨️'}
                        </button>
                        {tracks.length > 1 && (
                          <button
                            className="track-action-btn remove"
                            onClick={() => {
                              if (window.confirm(`Remove ${track.name}?`)) {
                                removeTrack(track.id);
                              }
                            }}
                            title="Remove Track"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                  </div>
                  
                    {/* Track Content */}
                    {!track.collapsed && (
                    <div
                      className="track-content"
                      style={{ position: 'relative' }}
                      onClick={(e) => {
                        // Don't handle click if clicking on timeline items
                        if (e.target.closest('.timeline-item') || e.target.closest('.item-remove-btn')) {
                          return;
                        }
                        
                        // Handle click on empty track area
                        if (e.target === e.currentTarget || e.target.classList.contains('empty-track-message') || e.target.classList.contains('track-content')) {
                          setSelectedTrackId(track.id);
                          // Seek video to clicked position
                          handleTimelineClick(e, e.currentTarget);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Clear drag state
                        setDragState({ isDragging: false, dragItemId: null, dragTrackId: null, hoverTrackId: null });
                        const itemId = e.dataTransfer.getData('text/plain');
                        const trackId = e.dataTransfer.getData('trackId');
                        const fileType = e.dataTransfer.getData('fileType');
                        const files = e.dataTransfer.files;
                        
                        const rect = e.currentTarget.getBoundingClientRect();
                        // Calculate drop position relative to track content
                        // Use the actual drop position, ensuring it's within bounds
                        const dropX = e.clientX - rect.left;
                        const x = Math.max(0, Math.min(dropX, rect.width));
                        const duration = getTimelineDuration();
                        let newStartTime = duration > 0 ? Math.max(0, (x / rect.width) * duration / timelineZoom) : 0;
                        
                        // Handle moving existing item
                        if (itemId && trackId) {
                          setTracks(prevTracks => {
                            const sourceTrack = prevTracks.find(t => t.id === trackId);
                            const item = sourceTrack?.items.find(i => i.id === itemId);
                            
                            if (!item || track.locked) {
                              return prevTracks; // Don't move if item not found or track is locked
                            }
                            
                            // Validate track type compatibility
                            // Video items can only go to video tracks
                            // Audio items can only go to audio tracks
                            // Subtitle items can only go to subtitle tracks
                            if (item.clipId && track.type !== 'video') {
                              return prevTracks; // Video items can only go to video tracks
                            }
                            if (item.type === 'audio' && track.type !== 'audio') {
                              return prevTracks; // Audio items can only go to audio tracks
                            }
                            if (item.subtitleId && track.type !== 'subtitle') {
                              return prevTracks; // Subtitle items can only go to subtitle tracks
                            }
                            
                            const itemDuration = item.duration || 0;
                            
                            // Apply snapping
                            newStartTime = snapToNearest(newStartTime, itemId, trackId);
                            
                            // Constrain to timeline bounds
                            newStartTime = constrainItemPosition(newStartTime, itemDuration, duration);
                            
                            // Prevent overlaps on the same track
                            if (trackId === track.id) {
                              // Same track - check for overlaps
                              if (wouldOverlap(track.id, itemId, newStartTime, itemDuration)) {
                                // Find non-overlapping position
                                newStartTime = findNonOverlappingPosition(track.id, itemId, newStartTime, itemDuration);
                              }
                            } else {
                              // Different track - check for overlaps on target track
                              if (wouldOverlap(track.id, null, newStartTime, itemDuration, itemId)) {
                                // Find non-overlapping position
                                newStartTime = findNonOverlappingPosition(track.id, null, newStartTime, itemDuration, itemId);
                              }
                            }
                            
                            // Check if moving to same track (just update position) or different track
                            if (trackId === track.id) {
                              // Moving within same track - just update position
                              return prevTracks.map(t => {
                                if (t.id === track.id) {
                                  return {
                                    ...t,
                                    items: t.items.map(i => {
                                      if (i.id === itemId) {
                                        // For subtitle items, also update the subtitle's startTime
                                        if (i.subtitleId) {
                                          const subtitle = subtitles.find(s => s.id === i.subtitleId);
                                          if (subtitle) {
                                            const duration = i.duration || 3;
                                            updateSubtitle(i.subtitleId, 'startTime', newStartTime);
                                            updateSubtitle(i.subtitleId, 'endTime', newStartTime + duration);
                                          }
                                        }
                                        return { ...i, startTime: newStartTime };
                                      }
                                      return i;
                                    })
                                  };
                                }
                                return t;
                              });
                            } else {
                              // Moving to different track - remove from source, add to target
                              return prevTracks.map(t => {
                                if (t.id === trackId) {
                                  // Remove from source track
                                  return { ...t, items: t.items.filter(i => i.id !== itemId) };
                                }
                                if (t.id === track.id) {
                                  // Add to target track (check if already exists to prevent duplicates)
                                  const itemExists = t.items.find(i => i.id === itemId);
                                  if (!itemExists) {
                                    return { ...t, items: [...t.items, { ...item, startTime: newStartTime }] };
                                  }
                                }
                                return t;
                              });
                            }
                          });
                        }
                        // Handle dropping files
                        else if (files && files.length > 0) {
                          const file = files[0];
                          if (track.type === 'video' && file.type.startsWith('video/')) {
                            const url = URL.createObjectURL(file);
                            const video = document.createElement('video');
                            video.src = url;
                            video.onloadedmetadata = () => {
                              const clip = {
                                id: Date.now() + Math.random(),
                                file: file,
                                url: url,
                                originalDuration: video.duration,
                                startTime: 0,
                                endTime: video.duration,
                                filters: {
                                  brightness: 100,
                                  contrast: 100,
                                  saturation: 100,
                                  hue: 0,
                                  blur: 0,
                                  sepia: 0,
                                  grayscale: 0
                                },
                                zoom: 100,
                                speed: 1.0,
                                rotation: 0,
                                flipHorizontal: false,
                                flipVertical: false,
                                crop: { enabled: false, x: 0, y: 0, width: 100, height: 100 },
                                muted: false,
                                reversed: false,
                                subtitles: []
                              };
                              
                              // Add to clips and track
                              setClips(prev => {
                                const newClips = [...prev, clip];
                                // Always select the newly added clip
                                setSelectedClipId(clip.id);
                                // Set legacy state for backward compatibility (only for first clip or when no clip selected)
                                if (prev.length === 0 || !selectedClipId) {
                                  setVideoFile(file);
                                  setVideoUrl(url);
                                  setStartTime(0);
                                  setEndTime(video.duration);
                                  setDuration(video.duration);
                                  setOriginalDuration(video.duration);
                                  setFilters(clip.filters);
                                  setZoom(clip.zoom);
                                } else {
                                  // For subsequent clips, just update the video preview
                                  setVideoFile(file);
                                  setVideoUrl(url);
                                  setStartTime(clip.startTime);
                                  setEndTime(clip.endTime);
                                  setDuration(video.duration);
                                  setOriginalDuration(video.duration);
                                  setFilters(clip.filters);
                                  setZoom(clip.zoom);
                                }
                                return newClips;
                              });
                              
                              // Apply snapping and overlap prevention for new item
                              let finalStartTime = newStartTime;
                              finalStartTime = snapToNearest(finalStartTime);
                              finalStartTime = constrainItemPosition(finalStartTime, video.duration, duration);
                              
                              // Check for overlaps and find non-overlapping position
                              if (wouldOverlap(track.id, null, finalStartTime, video.duration)) {
                                finalStartTime = findNonOverlappingPosition(track.id, null, finalStartTime, video.duration);
                              }
                              
                              // Add to track at drop position
                              const timelineItem = {
                                id: `item-${Date.now()}-${Math.random()}`,
                                type: 'video',
                                clipId: clip.id,
                                startTime: finalStartTime,
                                duration: video.duration,
                                file: file,
                                url: url,
                                originalDuration: video.duration,
                                endTime: video.duration,
                                filters: clip.filters,
                                zoom: clip.zoom,
                                speed: clip.speed,
                                rotation: clip.rotation,
                                flipHorizontal: clip.flipHorizontal,
                                flipVertical: clip.flipVertical,
                                crop: clip.crop,
                                muted: clip.muted,
                                reversed: clip.reversed
                              };
                              
                              addItemToTrack(track.id, timelineItem);
                            };
                          } else if (track.type === 'audio' && file.type.startsWith('audio/')) {
                            // Handle audio file drop
                            const url = URL.createObjectURL(file);
                            const audio = document.createElement('audio');
                            audio.src = url;
                            audio.onloadedmetadata = () => {
                              // Apply snapping and overlap prevention for new audio item
                              let finalStartTime = newStartTime;
                              finalStartTime = snapToNearest(finalStartTime);
                              finalStartTime = constrainItemPosition(finalStartTime, audio.duration, duration);
                              
                              // Check for overlaps and find non-overlapping position
                              if (wouldOverlap(track.id, null, finalStartTime, audio.duration)) {
                                finalStartTime = findNonOverlappingPosition(track.id, null, finalStartTime, audio.duration);
                              }
                              
                              const audioItem = {
                                id: `audio-item-${Date.now()}`,
                                type: 'audio',
                                startTime: finalStartTime,
                                duration: audio.duration,
                                file: file,
                                url: url
                              };
                              addItemToTrack(track.id, audioItem);
                            };
                          }
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (track.locked) {
                          e.dataTransfer.dropEffect = 'none';
                          return;
                        }
                        // During dragOver, we can't read dataTransfer.getData(), but we can check types
                        // The actual validation happens in onDrop
                        // Allow all drags over valid tracks (validation happens on drop)
                        e.dataTransfer.dropEffect = 'move';
                      }}
                    >
                      {track.items.length === 0 && (
                        <div 
                          className="empty-track-message"
                          onClick={(e) => {
                            if (track.type === 'subtitle') {
                              // Add subtitle when clicking empty subtitle track
                              const rect = e.currentTarget.parentElement.getBoundingClientRect();
                              const x = e.clientX - rect.left;
                              const duration = getTimelineDuration();
                              const clickedTime = duration > 0 ? (x / rect.width) * duration / timelineZoom : 0;
                              const constrainedTime = Math.max(0, Math.min(clickedTime, duration));
                              
                              const newSubtitle = {
                                id: Date.now(),
                                text: '',
                                startTime: constrainedTime,
                                endTime: Math.min(constrainedTime + 3, duration),
                                position: 'bottom'
                              };
                              setSubtitles([...subtitles, newSubtitle]);
                              setEditingSubtitle(newSubtitle.id);
                              setCurrentTime(constrainedTime);
                              
                              // Add to subtitle track
                              const timelineItem = {
                                id: `subtitle-item-${newSubtitle.id}`,
                                type: 'subtitle',
                                subtitleId: newSubtitle.id,
                                startTime: constrainedTime,
                                duration: 3,
                                text: ''
                              };
                              addItemToTrack(track.id, timelineItem);
                            }
                          }}
                          style={{ cursor: track.type === 'subtitle' ? 'pointer' : 'default' }}
                        >
                          <span>
                            {track.type === 'subtitle' 
                              ? 'Click here to add subtitle' 
                              : `Drop ${track.type} items here or use "Add ${track.type === 'video' ? 'Video' : 'Audio'}" button`}
                        </span>
                        </div>
                      )}
                      {track.items.map((item) => {
                        const duration = getTimelineDuration();
                        // Ensure we have valid values and prevent division issues
                        const itemStart = item.startTime || 0;
                        const itemDuration = item.duration || 0;
                        
                        // Calculate position and width more accurately
                        const itemLeft = duration > 0 ? Math.max(0, (itemStart / duration) * 100 * timelineZoom) : 0;
                        const itemWidth = duration > 0 ? Math.max(20, (itemDuration / duration) * 100 * timelineZoom) : 20; // Minimum 20px width for visibility
                        
                        // Ensure item doesn't go beyond timeline
                        const maxLeft = 100 * timelineZoom;
                        const adjustedLeft = Math.min(itemLeft, maxLeft - itemWidth);
                        
                        return (
                          <div
                            key={item.id}
                            className={`timeline-item ${selectedItemId === item.id ? 'selected' : ''} ${track.type}`}
                      style={{
                              left: `${adjustedLeft}%`,
                              width: `${itemWidth}%`,
                              minWidth: '20px',
                              position: 'absolute',
                              zIndex: selectedItemId === item.id ? 5 : 2,
                              transition: selectedItemId === item.id ? 'none' : 'all 0.2s ease',
                              pointerEvents: 'auto' // Allow drag operations
                            }}
                            draggable={!track.locked}
                            onDragStart={(e) => {
                              if (track.locked) {
                                e.preventDefault();
                                return;
                              }
                              // Ensure we have valid item data
                              if (!item.id || (!item.clipId && item.type !== 'audio' && !item.subtitleId)) {
                                e.preventDefault();
                                return;
                              }
                              
                              // Pause video if playing
                              if (videoRef.current && !videoRef.current.paused) {
                                setIsPlaying(true);
                                videoRef.current.pause();
                              }
                              
                              e.dataTransfer.setData('text/plain', item.id);
                              e.dataTransfer.setData('trackId', track.id);
                              e.dataTransfer.effectAllowed = 'move';
                              // Set drag state for visual feedback
                              setDragState({ isDragging: true, dragItemId: item.id, dragTrackId: track.id, hoverTrackId: null });
                              // Disable transitions during drag for smoother movement
                              e.currentTarget.style.transition = 'none';
                              e.currentTarget.style.opacity = '0.6';
                              e.currentTarget.style.transform = 'scale(0.95)';
                              e.currentTarget.classList.add('dragging');
                              // Add class to body to show drag cursor
                              document.body.classList.add('dragging-timeline-item');
                              
                              // Track mouse position for tooltip during drag
                              // Store reference to track content element
                              const itemElement = e.currentTarget;
                              if (!itemElement) return;
                              const trackContentElement = itemElement.closest('.track-content');
                              
                              const handleDragMove = (moveEvent) => {
                                // Find track content from the drag event or use stored reference
                                let trackContent = trackContentElement;
                                
                                // Try to find track content from elements under the cursor
                                if (!trackContent) {
                                  const elementsUnderPoint = document.elementsFromPoint(moveEvent.clientX, moveEvent.clientY);
                                  trackContent = elementsUnderPoint.find(el => el.classList.contains('track-content'));
                                }
                                
                                if (trackContent) {
                                  const rect = trackContent.getBoundingClientRect();
                                  const duration = getTimelineDuration();
                                  const dropX = moveEvent.clientX - rect.left;
                                  const x = Math.max(0, Math.min(dropX, rect.width));
                                  let newStartTime = duration > 0 ? Math.max(0, (x / rect.width) * duration / timelineZoom) : 0;
                                  
                                  // Apply snapping
                                  newStartTime = snapToNearest(newStartTime, item.id, track.id);
                                  
                                  // Show tooltip
                                  setTooltip({
                                    show: true,
                                    x: moveEvent.clientX,
                                    y: moveEvent.clientY - 30,
                                    text: formatTime(newStartTime)
                                  });
                                }
                              };
                              
                              document.addEventListener('dragover', handleDragMove);
                              e.currentTarget._dragMoveHandler = handleDragMove;
                            }}
                            onDragEnd={(e) => {
                              // Restore transitions and opacity
                              e.currentTarget.style.transition = '';
                              e.currentTarget.style.opacity = '1';
                              e.currentTarget.style.transform = '';
                              e.currentTarget.classList.remove('dragging');
                              // Clear drag state
                              setDragState({ isDragging: false, dragItemId: null, dragTrackId: null, hoverTrackId: null });
                              // Remove drag cursor class
                              document.body.classList.remove('dragging-timeline-item');
                              // Hide tooltip
                              setTooltip({ show: false, x: 0, y: 0, text: '' });
                              // Remove drag move handler
                              if (e.currentTarget._dragMoveHandler) {
                                document.removeEventListener('dragover', e.currentTarget._dragMoveHandler);
                                delete e.currentTarget._dragMoveHandler;
                              }
                              // Note: Items are only moved when a valid drop occurs in the onDrop handler.
                              // If drag is cancelled (no drop), the item remains in its original position.
                            }}
                            onDrop={(e) => {
                              // Handle drop on the item itself (for repositioning)
                              e.preventDefault();
                              e.stopPropagation();
                              
                              const itemId = e.dataTransfer.getData('text/plain');
                              const trackId = e.dataTransfer.getData('trackId');
                              
                              // Only handle if this is the item being dragged
                              if (itemId === item.id && trackId === track.id) {
                                // Get the parent track-content to calculate position
                                const trackContent = e.currentTarget.closest('.track-content');
                                if (trackContent) {
                                  const rect = trackContent.getBoundingClientRect();
                                  const dropX = e.clientX - rect.left;
                                  const x = Math.max(0, Math.min(dropX, rect.width));
                                  const duration = getTimelineDuration();
                                  let newStartTime = duration > 0 ? Math.max(0, (x / rect.width) * duration / timelineZoom) : 0;
                                  
                                  const itemDuration = item.duration || 0;
                                  
                                  // Apply snapping
                                  newStartTime = snapToNearest(newStartTime, itemId, trackId);
                                  
                                  // Constrain to timeline bounds
                                  newStartTime = constrainItemPosition(newStartTime, itemDuration, duration);
                                  
                                  // Prevent overlaps
                                  if (wouldOverlap(track.id, itemId, newStartTime, itemDuration)) {
                                    newStartTime = findNonOverlappingPosition(track.id, itemId, newStartTime, itemDuration);
                                  }
                                  
                                  // Update item position
                                  setTracks(prevTracks => prevTracks.map(t => {
                                    if (t.id === track.id) {
                                      return {
                                        ...t,
                                        items: t.items.map(i => {
                                          if (i.id === itemId) {
                                            // For subtitle items, also update the subtitle's startTime
                                            if (i.subtitleId) {
                                              const subtitle = subtitles.find(s => s.id === i.subtitleId);
                                              if (subtitle) {
                                                const duration = i.duration || 3;
                                                updateSubtitle(i.subtitleId, 'startTime', newStartTime);
                                                updateSubtitle(i.subtitleId, 'endTime', newStartTime + duration);
                                              }
                                            }
                                            return { ...i, startTime: newStartTime };
                                          }
                                          return i;
                                        })
                                      };
                                    }
                                    return t;
                                  }));
                                }
                              }
                            }}
                            onDragOver={(e) => {
                              // Allow drops on items for repositioning
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = 'move';
                            }}
                          onClick={(e) => {
                            // Only handle click if not dragging
                            if (e.defaultPrevented) return;
                            e.stopPropagation();
                            setSelectedItemId(item.id);
                            setSelectedTrackId(track.id);
                            // Select the clip if it's a video item
                            if (item.clipId) {
                              const clip = clips.find(c => c.id === item.clipId);
                              if (clip) {
                                // Select the clip first - this updates the video preview
                                setSelectedClipId(item.clipId);
                                selectClip(item.clipId);
                                
                                // Calculate click position within item
                                const itemRect = e.currentTarget.getBoundingClientRect();
                                const clickX = e.clientX - itemRect.left;
                                const itemWidth = itemRect.width;
                                const clickPercent = Math.max(0, Math.min(1, clickX / itemWidth));
                                
                                // Calculate the time within the trimmed clip
                                // item.duration is the trimmed duration
                                const trimmedDuration = item.duration || 0;
                                const itemLocalTime = clickPercent * trimmedDuration;
                                
                                // Calculate timeline time
                                const timelineTime = (item.startTime || 0) + itemLocalTime;
                                setCurrentTime(timelineTime);
                                
                                // Wait for video to load, then seek to the correct position
                                setTimeout(() => {
                                  if (videoRef.current) {
                                    // Calculate the actual video time considering trim
                                    // clip.startTime and clip.endTime are the trim points
                                    const clipTrimStart = clip.startTime || 0;
                                    const clipTrimEnd = clip.endTime || clip.originalDuration || 0;
                                    const clipTrimDuration = clipTrimEnd - clipTrimStart;
                                    
                                    // Map the clicked position in the timeline item to the actual video time
                                    // itemLocalTime is within the trimmed duration shown in timeline
                                    // We need to map it to the actual video time
                                    const videoTime = clipTrimStart + (itemLocalTime / trimmedDuration) * clipTrimDuration;
                                    
                                    if (previewUrl) {
                                      // For preview, the video is already trimmed, so use itemLocalTime directly
                                      videoRef.current.currentTime = Math.max(0, Math.min(itemLocalTime, trimmedDuration));
                                    } else {
                                      // For original video, seek to the calculated video time
                                      videoRef.current.currentTime = Math.max(0, Math.min(videoTime, clip.originalDuration || 0));
                                    }
                                  }
                                }, 100);
                              }
                            }
                            // Handle subtitle item selection
                            else if (item.subtitleId) {
                              const subtitle = subtitles.find(s => s.id === item.subtitleId);
                              if (subtitle) {
                                setEditingSubtitle(subtitle.id);
                                setCurrentTime(item.startTime || 0);
                              }
                            }
                          }}
                          title={`${track.type}: ${formatTime(item.startTime)} - ${formatTime(item.startTime + (item.duration || 0))} (${formatTime(item.duration || 0)} trimmed)`}
                          >
                            {/* Trim Handle - Left (Start) */}
                            {!track.locked && item.clipId && (
                              <div
                                className="timeline-item-trim-handle timeline-item-trim-handle-left"
                                onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                                  
                                  // Pause video if playing
                                  if (videoRef.current && !videoRef.current.paused) {
                                    setIsPlaying(true);
                                    videoRef.current.pause();
                                  }
                                  
                                  const clip = clips.find(c => c.id === item.clipId);
                                  if (!clip) return;
                                  
                                  // Select the clip first
                                  setSelectedClipId(item.clipId);
                                  selectClip(item.clipId);
                                  
                                  const itemElement = e.currentTarget.parentElement;
                                  const trackContent = itemElement.closest('.track-content');
                                  if (!trackContent) return;
                                  
                                  const rect = trackContent.getBoundingClientRect();
                                  const duration = getTimelineDuration();
                                  const originalDur = clip.originalDuration || 0;
                                  const initialStart = clip.startTime || 0;
                                  const initialEnd = clip.endTime || originalDur;
                                  
                                  const handleMouseMove = (moveEvent) => {
                                    const currentX = moveEvent.clientX - rect.left;
                                    const currentPercent = Math.max(0, Math.min(1, currentX / rect.width));
                                    let newTimelineTime = (currentPercent * duration) / timelineZoom;
                                    
                                    // Apply snapping
                                    newTimelineTime = snapToNearest(newTimelineTime, item.id, track.id);
                                    
                                    // Calculate new start time relative to clip's original duration
                                    // The timeline position maps to a position in the original video
                                    const itemTimelineStart = item.startTime || 0;
                                    const timelineOffset = newTimelineTime - itemTimelineStart;
                                    
                                    // Map timeline offset to clip's local time
                                    const newStartTime = Math.max(0, Math.min(initialStart + timelineOffset, initialEnd - 0.001)); // 0.001s minimum gap
                                    
                                    // Show tooltip
                                    setTooltip({
                                      show: true,
                                      x: moveEvent.clientX,
                                      y: moveEvent.clientY - 30,
                                      text: formatTime(newStartTime)
                                    });
                                    
                                    if (newStartTime < initialEnd - 0.001) {
                                      setStartTime(newStartTime);
                                      setEndTime(initialEnd);
                                    }
                                  };
                                  
                                  const handleMouseUp = () => {
                                    document.removeEventListener('mousemove', handleMouseMove);
                                    document.removeEventListener('mouseup', handleMouseUp);
                                    setTooltip({ show: false, x: 0, y: 0, text: '' });
                                  };
                                  
                                  document.addEventListener('mousemove', handleMouseMove);
                                  document.addEventListener('mouseup', handleMouseUp);
                                }}
                              />
                            )}
                            
                            {/* Trim Handle - Right (End) */}
                            {!track.locked && item.clipId && (
                              <div
                                className="timeline-item-trim-handle timeline-item-trim-handle-right"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  
                                  // Pause video if playing
                                  if (videoRef.current && !videoRef.current.paused) {
                                    setIsPlaying(true);
                                    videoRef.current.pause();
                                  }
                                  
                                  const clip = clips.find(c => c.id === item.clipId);
                                  if (!clip) return;
                                  
                                  // Select the clip first
                                  setSelectedClipId(item.clipId);
                                  selectClip(item.clipId);
                                  
                                  const itemElement = e.currentTarget.parentElement;
                                  const trackContent = itemElement.closest('.track-content');
                                  if (!trackContent) return;
                                  
                                  const rect = trackContent.getBoundingClientRect();
                                  const duration = getTimelineDuration();
                                  const originalDur = clip.originalDuration || 0;
                                  const initialStart = clip.startTime || 0;
                                  const initialEnd = clip.endTime || originalDur;
                                  
                                  const handleMouseMove = (moveEvent) => {
                                    const currentX = moveEvent.clientX - rect.left;
                                    const currentPercent = Math.max(0, Math.min(1, currentX / rect.width));
                                    let newTimelineTime = (currentPercent * duration) / timelineZoom;
                                    
                                    // Apply snapping
                                    newTimelineTime = snapToNearest(newTimelineTime, item.id, track.id);
                                    
                                    // Calculate new end time relative to clip's original duration
                                    const itemTimelineStart = item.startTime || 0;
                                    const timelineOffset = newTimelineTime - itemTimelineStart;
                                    
                                    // Map timeline offset to clip's local time
                                    const newEndTime = Math.max(initialStart + 0.001, Math.min(initialStart + timelineOffset, originalDur)); // 0.001s minimum gap
                                    
                                    // Show tooltip
                                    setTooltip({
                                      show: true,
                                      x: moveEvent.clientX,
                                      y: moveEvent.clientY - 30,
                                      text: formatTime(newEndTime)
                                    });
                                    
                                    if (newEndTime > initialStart + 0.001) {
                                      setStartTime(initialStart);
                                      setEndTime(newEndTime);
                                    }
                                  };
                                  
                                  const handleMouseUp = () => {
                                    document.removeEventListener('mousemove', handleMouseMove);
                                    document.removeEventListener('mouseup', handleMouseUp);
                                    setTooltip({ show: false, x: 0, y: 0, text: '' });
                                  };
                                  
                                  document.addEventListener('mousemove', handleMouseMove);
                                  document.addEventListener('mouseup', handleMouseUp);
                      }}
                    />
                  )}
                  
                            {/* Trim Handle - Left (Start) for Subtitles */}
                            {!track.locked && item.subtitleId && (
                              <div
                                className="timeline-item-trim-handle timeline-item-trim-handle-left"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  
                                  // Pause video if playing
                                  if (videoRef.current && !videoRef.current.paused) {
                                    setIsPlaying(true);
                                    videoRef.current.pause();
                                  }
                                  
                                  const subtitle = subtitles.find(s => s.id === item.subtitleId);
                                  if (!subtitle) return;
                                  
                                  // Select the subtitle
                                  setEditingSubtitle(subtitle.id);
                                  
                                  const itemElement = e.currentTarget.parentElement;
                                  const trackContent = itemElement.closest('.track-content');
                                  if (!trackContent) return;
                                  
                                  const rect = trackContent.getBoundingClientRect();
                                  const duration = getTimelineDuration();
                                  const initialStart = subtitle.startTime || 0;
                                  const initialEnd = subtitle.endTime || (subtitle.startTime || 0) + (item.duration || 3);
                                  
                                  const handleMouseMove = (moveEvent) => {
                                    const currentX = moveEvent.clientX - rect.left;
                                    const currentPercent = Math.max(0, Math.min(1, currentX / rect.width));
                                    let newTimelineTime = (currentPercent * duration) / timelineZoom;
                                    
                                    // Apply snapping
                                    newTimelineTime = snapToNearest(newTimelineTime, item.id, track.id);
                                    
                                    // Ensure new start time is before end time
                                    const newStartTime = Math.max(0, Math.min(newTimelineTime, initialEnd - 0.001));
                                    
                                    // Show tooltip
                                    setTooltip({
                                      show: true,
                                      x: moveEvent.clientX,
                                      y: moveEvent.clientY - 30,
                                      text: formatTime(newStartTime)
                                    });
                                    
                                    if (newStartTime < initialEnd - 0.001) {
                                      updateSubtitle(subtitle.id, 'startTime', newStartTime);
                                      // Update the timeline item's startTime and duration
                                      setTracks(prevTracks => prevTracks.map(t => {
                                        if (t.id === track.id) {
                                          return {
                                            ...t,
                                            items: t.items.map(i => {
                                              if (i.id === item.id) {
                                                const newDuration = initialEnd - newStartTime;
                                                return { ...i, startTime: newStartTime, duration: newDuration };
                                              }
                                              return i;
                                            })
                                          };
                                        }
                                        return t;
                                      }));
                                    }
                                  };
                                  
                                  const handleMouseUp = () => {
                                    document.removeEventListener('mousemove', handleMouseMove);
                                    document.removeEventListener('mouseup', handleMouseUp);
                                    setTooltip({ show: false, x: 0, y: 0, text: '' });
                                  };
                                  
                                  document.addEventListener('mousemove', handleMouseMove);
                                  document.addEventListener('mouseup', handleMouseUp);
                                }}
                              />
                            )}
                            
                            {/* Trim Handle - Right (End) for Subtitles */}
                            {!track.locked && item.subtitleId && (
                              <div
                                className="timeline-item-trim-handle timeline-item-trim-handle-right"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  
                                  // Pause video if playing
                                  if (videoRef.current && !videoRef.current.paused) {
                                    setIsPlaying(true);
                                    videoRef.current.pause();
                                  }
                                  
                                  const subtitle = subtitles.find(s => s.id === item.subtitleId);
                                  if (!subtitle) return;
                                  
                                  // Select the subtitle
                                  setEditingSubtitle(subtitle.id);
                                  
                                  const itemElement = e.currentTarget.parentElement;
                                  const trackContent = itemElement.closest('.track-content');
                                  if (!trackContent) return;
                                  
                                  const rect = trackContent.getBoundingClientRect();
                                  const duration = getTimelineDuration();
                                  const initialStart = subtitle.startTime || 0;
                                  const initialEnd = subtitle.endTime || (subtitle.startTime || 0) + (item.duration || 3);
                                  
                                  const handleMouseMove = (moveEvent) => {
                                    const currentX = moveEvent.clientX - rect.left;
                                    const currentPercent = Math.max(0, Math.min(1, currentX / rect.width));
                                    let newTimelineTime = (currentPercent * duration) / timelineZoom;
                                    
                                    // Apply snapping
                                    newTimelineTime = snapToNearest(newTimelineTime, item.id, track.id);
                                    
                                    // Ensure new end time is after start time
                                    const newEndTime = Math.max(initialStart + 0.001, newTimelineTime);
                                    
                                    // Show tooltip
                                    setTooltip({
                                      show: true,
                                      x: moveEvent.clientX,
                                      y: moveEvent.clientY - 30,
                                      text: formatTime(newEndTime)
                                    });
                                    
                                    if (newEndTime > initialStart + 0.001) {
                                      updateSubtitle(subtitle.id, 'endTime', newEndTime);
                                      // Update the timeline item's duration
                                      setTracks(prevTracks => prevTracks.map(t => {
                                        if (t.id === track.id) {
                                          return {
                                            ...t,
                                            items: t.items.map(i => {
                                              if (i.id === item.id) {
                                                const newDuration = newEndTime - initialStart;
                                                return { ...i, duration: newDuration };
                                              }
                                              return i;
                                            })
                                          };
                                        }
                                        return t;
                                      }));
                                    }
                                  };
                                  
                                  const handleMouseUp = () => {
                                    document.removeEventListener('mousemove', handleMouseMove);
                                    document.removeEventListener('mouseup', handleMouseUp);
                                    setTooltip({ show: false, x: 0, y: 0, text: '' });
                                  };
                                  
                                  document.addEventListener('mousemove', handleMouseMove);
                                  document.addEventListener('mouseup', handleMouseUp);
                                }}
                              />
                            )}
                            
                            {/* Trim Handle - Left (Start) for Audio */}
                            {!track.locked && item.type === 'audio' && (
                              <div
                                className="timeline-item-trim-handle timeline-item-trim-handle-left"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  
                                  // Pause video if playing
                                  if (videoRef.current && !videoRef.current.paused) {
                                    setIsPlaying(true);
                                    videoRef.current.pause();
                                  }
                                  
                                  const itemElement = e.currentTarget.parentElement;
                                  const trackContent = itemElement.closest('.track-content');
                                  if (!trackContent) return;
                                  
                                  const rect = trackContent.getBoundingClientRect();
                                  const duration = getTimelineDuration();
                                  const initialStart = item.startTime || 0;
                                  const initialEnd = initialStart + (item.duration || 0);
                                  
                                  const handleMouseMove = (moveEvent) => {
                                    const currentX = moveEvent.clientX - rect.left;
                                    const currentPercent = Math.max(0, Math.min(1, currentX / rect.width));
                                    let newTimelineTime = (currentPercent * duration) / timelineZoom;
                                    
                                    // Apply snapping
                                    newTimelineTime = snapToNearest(newTimelineTime, item.id, track.id);
                                    
                                    // Ensure new start time is before end time
                                    const newStartTime = Math.max(0, Math.min(newTimelineTime, initialEnd - 0.001));
                                    
                                    // Show tooltip
                                    setTooltip({
                                      show: true,
                                      x: moveEvent.clientX,
                                      y: moveEvent.clientY - 30,
                                      text: formatTime(newStartTime)
                                    });
                                    
                                    if (newStartTime < initialEnd - 0.001) {
                                      const newDuration = initialEnd - newStartTime;
                                      updateItemInTrack(track.id, item.id, {
                                        startTime: newStartTime,
                                        duration: newDuration
                                      });
                                    }
                                  };
                                  
                                  const handleMouseUp = () => {
                                    document.removeEventListener('mousemove', handleMouseMove);
                                    document.removeEventListener('mouseup', handleMouseUp);
                                    setTooltip({ show: false, x: 0, y: 0, text: '' });
                                  };
                                  
                                  document.addEventListener('mousemove', handleMouseMove);
                                  document.addEventListener('mouseup', handleMouseUp);
                                }}
                              />
                            )}
                            
                            {/* Trim Handle - Right (End) for Audio */}
                            {!track.locked && item.type === 'audio' && (
                              <div
                                className="timeline-item-trim-handle timeline-item-trim-handle-right"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  
                                  // Pause video if playing
                                  if (videoRef.current && !videoRef.current.paused) {
                                    setIsPlaying(true);
                                    videoRef.current.pause();
                                  }
                                  
                                  const itemElement = e.currentTarget.parentElement;
                                  const trackContent = itemElement.closest('.track-content');
                                  if (!trackContent) return;
                                  
                                  const rect = trackContent.getBoundingClientRect();
                                  const duration = getTimelineDuration();
                                  const initialStart = item.startTime || 0;
                                  const initialEnd = initialStart + (item.duration || 0);
                                  
                                  const handleMouseMove = (moveEvent) => {
                                    const currentX = moveEvent.clientX - rect.left;
                                    const currentPercent = Math.max(0, Math.min(1, currentX / rect.width));
                                    let newTimelineTime = (currentPercent * duration) / timelineZoom;
                                    
                                    // Apply snapping
                                    newTimelineTime = snapToNearest(newTimelineTime, item.id, track.id);
                                    
                                    // Ensure new end time is after start time
                                    const newEndTime = Math.max(initialStart + 0.001, newTimelineTime);
                                    
                                    // Show tooltip
                                    setTooltip({
                                      show: true,
                                      x: moveEvent.clientX,
                                      y: moveEvent.clientY - 30,
                                      text: formatTime(newEndTime)
                                    });
                                    
                                    if (newEndTime > initialStart + 0.001) {
                                      const newDuration = newEndTime - initialStart;
                                      updateItemInTrack(track.id, item.id, {
                                        duration: newDuration
                                      });
                                    }
                                  };
                                  
                                  const handleMouseUp = () => {
                                    document.removeEventListener('mousemove', handleMouseMove);
                                    document.removeEventListener('mouseup', handleMouseUp);
                                    setTooltip({ show: false, x: 0, y: 0, text: '' });
                                  };
                                  
                                  document.addEventListener('mousemove', handleMouseMove);
                                  document.addEventListener('mouseup', handleMouseUp);
                                }}
                              />
                            )}
                  
                            <div className="timeline-item-content">
                              <span className="item-label">
                                {track.type === 'video' ? '🎬' : track.type === 'audio' ? '🎵' : '📝'}
                                {track.type === 'subtitle' ? (() => {
                                  // Get the latest subtitle text from subtitles array
                                  const subtitle = item.subtitleId ? subtitles.find(s => s.id === item.subtitleId) : null;
                                  const subtitleText = subtitle?.text || item.text || '';
                                  return subtitleText ? subtitleText.substring(0, 20) : '📝';
                                })() : (() => {
                                  // For video items, show trimmed duration (endTime - startTime from clip)
                                  if (item.clipId) {
                                    const clip = clips.find(c => c.id === item.clipId);
                                    if (clip) {
                                      const trimmedDuration = (clip.endTime || 0) - (clip.startTime || 0);
                                      return formatTime(trimmedDuration);
                                    }
                                  }
                                  // For other items, use item duration
                                  return formatTime(item.duration || 0);
                                })()}
                        </span>
                              {!track.locked && (
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                  <button
                                    className="item-split-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      splitTimelineItem(track.id, item.id);
                                    }}
                                    title="Split at playhead position"
                                  >
                                    ✂️
                                  </button>
                                  <button
                                    className="item-remove-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (window.confirm('Remove this item?')) {
                                        // If it's a video item, also remove the clip and its subtitles
                                        if (item.clipId) {
                                          removeClip(item.clipId);
                                        } else if (item.subtitleId) {
                                          // Remove subtitle
                                          deleteSubtitle(item.subtitleId);
                                        } else {
                                          // Just remove the item (audio items)
                                          removeItemFromTrack(track.id, item.id);
                                          // Revoke URL if it exists
                                          if (item.url) {
                                            URL.revokeObjectURL(item.url);
                                          }
                                        }
                                      }
                                    }}
                                    title="Remove"
                                  >
                                    ✕
                                  </button>
                                </div>
                              )}
                      </div>
                  </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                ))}
                </div>
            </div>
        </div>

          {/* Controls Section - Two Columns */}
          <div className="editor-content">
            <div className="controls-section-left">
            <div className="subtitle-controls">
              <h3>📝 Subtitles</h3>
              <button 
                onClick={() => {
                  // Add subtitle at current time on timeline
                  const subtitleTrack = tracks.find(t => t.type === 'subtitle');
                  if (subtitleTrack) {
                    const constrainedStart = Math.max(0, currentTime);
                    const constrainedEnd = Math.min(constrainedStart + 3, getTimelineDuration());
                    
                    const newSubtitle = {
                      id: Date.now(),
                      text: '',
                      startTime: constrainedStart,
                      endTime: constrainedEnd,
                      position: 'bottom'
                    };
                    setSubtitles([...subtitles, newSubtitle]);
                    setEditingSubtitle(newSubtitle.id);
                    
                    // Add to subtitle track
                    const timelineItem = {
                      id: `subtitle-item-${newSubtitle.id}`,
                      type: 'subtitle',
                      subtitleId: newSubtitle.id,
                      startTime: constrainedStart,
                      duration: constrainedEnd - constrainedStart,
                      text: ''
                    };
                    addItemToTrack(subtitleTrack.id, timelineItem);
                  } else {
                    // Fallback to old method if no subtitle track
                    addSubtitle();
                  }
                }} 
                className="btn-add-subtitle"
                title="Add subtitle at current time"
              >
                ➕ Add Subtitle
              </button>
              
              {subtitles.length > 0 && (
                <div className="subtitle-list">
                  {subtitles.map(subtitle => (
                    <div 
                      key={subtitle.id} 
                      className={`subtitle-item ${editingSubtitle === subtitle.id ? 'editing' : ''}`}
                      data-subtitle-id={subtitle.id}
                    >
                      <div className="subtitle-header">
                        <span className="subtitle-time">
                          {formatTime(subtitle.startTime)} - {formatTime(subtitle.endTime)}
                        </span>
                        <button 
                          onClick={() => {
                            if (window.confirm(`Delete subtitle "${subtitle.text || 'Untitled'}"?`)) {
                              deleteSubtitle(subtitle.id);
                            }
                          }}
                          className="btn-delete-subtitle"
                          title="Delete subtitle"
                        >
                          <span className="delete-icon">✕</span>
                          <span className="delete-text">Delete</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={subtitle.text}
                        onChange={(e) => updateSubtitle(subtitle.id, 'text', e.target.value)}
                        placeholder="Enter subtitle text..."
                        className="subtitle-input"
                      />
                      <div className="subtitle-timing">
                        <div className="subtitle-timing-group">
                          <label>Start:</label>
                          <input
                            type="number"
                            step="0.1"
                            min={startTime}
                            max={endTime - 0.1}
                            value={subtitle.startTime}
                            onChange={(e) => {
                              const val = Math.max(startTime, Math.min(parseFloat(e.target.value) || startTime, Math.min(endTime - 0.1, subtitle.endTime - 0.1)));
                              updateSubtitle(subtitle.id, 'startTime', val);
                            }}
                            className="subtitle-time-input"
                          />
                        </div>
                        <div className="subtitle-timing-group">
                          <label>End:</label>
                          <input
                            type="number"
                            step="0.1"
                            min={Math.max(startTime + 0.1, subtitle.startTime + 0.1)}
                            max={endTime}
                            value={subtitle.endTime}
                            onChange={(e) => {
                              const val = Math.min(endTime, Math.max(parseFloat(e.target.value) || subtitle.startTime + 1, subtitle.startTime + 0.1));
                              updateSubtitle(subtitle.id, 'endTime', val);
                            }}
                            className="subtitle-time-input"
                          />
                        </div>
                        <div className="subtitle-timing-group">
                          <label>Position:</label>
                          <select
                            value={subtitle.position}
                            onChange={(e) => updateSubtitle(subtitle.id, 'position', e.target.value)}
                            className="subtitle-position-select"
                          >
                            <option value="bottom">Bottom</option>
                            <option value="center">Center</option>
                            <option value="top">Top</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="time-controls">
              <h3>✂️ Trim Video</h3>
              <div className="time-info">
                <p>Duration: {formatTime(originalDuration || duration)}</p>
                <p>Selected: {formatTime(endTime - startTime)}</p>
                {previewUrl && (
                  <p style={{ color: '#28a745', fontSize: '0.85rem' }}>
                    Preview: {formatTime(duration)}
                  </p>
                )}
              </div>
              <div className="time-inputs">
                <div className="time-input-group">
                  <label>Start Time (seconds)</label>
                  <input
                    type="number"
                    min="0"
                    max={originalDuration || duration}
                    step="0.001"
                    value={startTime}
                    onChange={(e) => {
                      const maxTime = originalDuration || duration;
                      const val = Math.max(0, Math.min(parseFloat(e.target.value) || 0, endTime - 0.001));
                      setStartTime(val);
                    }}
                    disabled={!selectedClipId}
                  />
                  <span>{formatTime(startTime)}</span>
                </div>
                <div className="time-input-group">
                  <label>End Time (seconds)</label>
                  <input
                    type="number"
                    min={startTime}
                    max={originalDuration || duration}
                    step="0.001"
                    value={endTime}
                    onChange={(e) => {
                      const maxTime = originalDuration || duration;
                      const val = Math.min(maxTime, Math.max(parseFloat(e.target.value) || 0, startTime + 0.001));
                      setEndTime(val);
                    }}
                    disabled={!selectedClipId}
                  />
                  <span>{formatTime(endTime)}</span>
                </div>
              </div>
            </div>

            <div className="filter-controls">
              <h3>🎨 Video Filters</h3>
              <div className="filter-group">
                <label>
                  Brightness: {filters.brightness}%
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={filters.brightness}
                    onChange={(e) => setFilters({...filters, brightness: parseFloat(e.target.value) || 100})}
                    disabled={!selectedClipId}
                  />
                </label>
                <label>
                  Contrast: {filters.contrast}%
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={filters.contrast}
                    onChange={(e) => setFilters({...filters, contrast: parseFloat(e.target.value) || 100})}
                    disabled={!selectedClipId}
                  />
                </label>
                <label>
                  Saturation: {filters.saturation}%
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={filters.saturation}
                    onChange={(e) => setFilters({...filters, saturation: parseFloat(e.target.value) || 100})}
                    disabled={!selectedClipId}
                  />
                </label>
                <label>
                  Hue: {filters.hue}°
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    value={filters.hue}
                    onChange={(e) => setFilters({...filters, hue: parseFloat(e.target.value) || 0})}
                    disabled={!selectedClipId}
                  />
                </label>
                <label>
                  Blur: {filters.blur}px
                  <input
                    type="range"
                    min="0"
                    max="20"
                    value={filters.blur}
                    onChange={(e) => setFilters({...filters, blur: parseFloat(e.target.value) || 0})}
                    disabled={!selectedClipId}
                  />
                </label>
                <label>
                  Sepia: {filters.sepia}%
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={filters.sepia}
                    onChange={(e) => setFilters({...filters, sepia: parseFloat(e.target.value) || 0})}
                    disabled={!selectedClipId}
                  />
                </label>
                <label>
                  Grayscale: {filters.grayscale}%
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={filters.grayscale}
                    onChange={(e) => setFilters({...filters, grayscale: parseFloat(e.target.value) || 0})}
                    disabled={!selectedClipId}
                  />
                </label>
              </div>
              </div>
            </div>

            <div className="controls-section-right">
            {/* Speed Control */}
            <div className="tool-controls">
              <h3>⚡ Speed</h3>
              <div className="tool-buttons">
                <button
                  className={`tool-btn ${speed === 0.25 ? 'active' : ''}`}
                  onClick={() => setSpeed(0.25)}
                  title="0.25x (Slow Motion)"
                  disabled={!selectedClipId}
                >
                  0.25x
                </button>
                <button
                  className={`tool-btn ${speed === 0.5 ? 'active' : ''}`}
                  onClick={() => setSpeed(0.5)}
                  title="0.5x (Slow)"
                  disabled={!selectedClipId}
                >
                  0.5x
                </button>
                <button
                  className={`tool-btn ${speed === 1.0 ? 'active' : ''}`}
                  onClick={() => setSpeed(1.0)}
                  title="1x (Normal)"
                  disabled={!selectedClipId}
                >
                  1x
                </button>
                <button
                  className={`tool-btn ${speed === 2.0 ? 'active' : ''}`}
                  onClick={() => setSpeed(2.0)}
                  title="2x (Fast)"
                  disabled={!selectedClipId}
                >
                  2x
                </button>
                <button
                  className={`tool-btn ${speed === 4.0 ? 'active' : ''}`}
                  onClick={() => setSpeed(4.0)}
                  title="4x (Very Fast)"
                  disabled={!selectedClipId}
                >
                  4x
                </button>
              </div>
              <div className="tool-slider">
                <label>
                  Custom Speed: {speed}x
                  <input
                    type="range"
                    min="0.25"
                    max="4"
                    step="0.25"
                    value={speed}
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    disabled={!selectedClipId}
                  />
                </label>
              </div>
            </div>

            {/* Rotate & Flip */}
            <div className="tool-controls">
              <h3>🔄 Rotate & Flip</h3>
              <div className="tool-buttons">
                <button
                  className={`tool-btn ${rotation === 0 ? 'active' : ''}`}
                  onClick={() => setRotation(0)}
                  title="0°"
                  disabled={!selectedClipId}
                >
                  ↻ 0°
                </button>
                <button
                  className={`tool-btn ${rotation === 90 ? 'active' : ''}`}
                  onClick={() => setRotation(90)}
                  title="90°"
                  disabled={!selectedClipId}
                >
                  ↻ 90°
                </button>
                <button
                  className={`tool-btn ${rotation === 180 ? 'active' : ''}`}
                  onClick={() => setRotation(180)}
                  title="180°"
                  disabled={!selectedClipId}
                >
                  ↻ 180°
                </button>
                <button
                  className={`tool-btn ${rotation === 270 ? 'active' : ''}`}
                  onClick={() => setRotation(270)}
                  title="270°"
                  disabled={!selectedClipId}
                >
                  ↻ 270°
                </button>
                <button
                  className={`tool-btn ${flipHorizontal ? 'active' : ''}`}
                  onClick={() => setFlipHorizontal(!flipHorizontal)}
                  title="Flip Horizontal"
                  disabled={!selectedClipId}
                >
                  ⇄ Flip H
                </button>
                <button
                  className={`tool-btn ${flipVertical ? 'active' : ''}`}
                  onClick={() => setFlipVertical(!flipVertical)}
                  title="Flip Vertical"
                  disabled={!selectedClipId}
                >
                  ⇅ Flip V
                </button>
              </div>
            </div>

            {/* Split & Actions */}
            <div className="tool-controls">
              <h3>✂️ Actions</h3>
              <div className="tool-buttons">
                <button
                  className="tool-btn"
                  onClick={() => {
                    if (selectedClipId && currentTime > startTime && currentTime < endTime) {
                      const clip = clips.find(c => c.id === selectedClipId);
                      if (clip) {
                        // Split clip at current time
                        const firstClip = {
                          ...clip,
                          id: clip.id,
                          endTime: currentTime
                        };
                        const secondClip = {
                          ...clip,
                          id: Date.now() + Math.random(),
                          startTime: currentTime,
                          file: clip.file,
                          url: clip.url
                        };
                        setClips(prev => {
                          const index = prev.findIndex(c => c.id === selectedClipId);
                          const newClips = [...prev];
                          newClips[index] = firstClip;
                          newClips.splice(index + 1, 0, secondClip);
                          setSelectedClipId(firstClip.id);
                          return newClips;
                        });
                        setEndTime(currentTime);
                      }
                    } else {
                      alert('Please select a position within the clip to split');
                    }
                  }}
                  title="Split clip at current time"
                  disabled={!selectedClipId}
                >
                  ✂️ Split
                </button>
                <button
                  className={`tool-btn ${reversed ? 'active' : ''}`}
                  onClick={() => setReversed(!reversed)}
                  title="Reverse video"
                  disabled={!selectedClipId}
                >
                  ⏪ Reverse
                </button>
                <button
                  className={`tool-btn ${muted ? 'active' : ''}`}
                  onClick={() => setMuted(!muted)}
                  title="Mute audio"
                  disabled={!selectedClipId}
                >
                  {muted ? '🔇 Muted' : '🔊 Mute'}
                </button>
              </div>
            </div>

            {/* Crop */}
            <div className="tool-controls">
              <h3>✂️ Crop</h3>
              <div className="tool-buttons">
                <button
                  className={`tool-btn ${crop.enabled ? 'active' : ''}`}
                  onClick={() => setCrop({...crop, enabled: !crop.enabled})}
                  title="Enable/Disable Crop"
                  disabled={!selectedClipId}
                >
                  {crop.enabled ? '✓ Crop On' : 'Crop Off'}
                </button>
              </div>
              {crop.enabled && (
                <div className="crop-controls">
                  <div className="crop-input-group">
                    <label>X Position: {crop.x}%</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={crop.x}
                      onChange={(e) => setCrop({...crop, x: parseFloat(e.target.value)})}
                      disabled={!selectedClipId}
                    />
                  </div>
                  <div className="crop-input-group">
                    <label>Y Position: {crop.y}%</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={crop.y}
                      onChange={(e) => setCrop({...crop, y: parseFloat(e.target.value)})}
                      disabled={!selectedClipId}
                    />
                  </div>
                  <div className="crop-input-group">
                    <label>Width: {crop.width}%</label>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={crop.width}
                      onChange={(e) => setCrop({...crop, width: parseFloat(e.target.value)})}
                      disabled={!selectedClipId}
                    />
                  </div>
                  <div className="crop-input-group">
                    <label>Height: {crop.height}%</label>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={crop.height}
                      onChange={(e) => setCrop({...crop, height: parseFloat(e.target.value)})}
                      disabled={!selectedClipId}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="audio-controls">
              <h3>🎵 Background Audio/Music</h3>
              <div className="audio-upload-section">
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      setBackgroundAudio(file);
                    }
                  }}
                  className="audio-file-input"
                  id="background-audio-input"
                />
                <label htmlFor="background-audio-input" className="audio-upload-label">
                  {backgroundAudio ? `📁 ${backgroundAudio.name}` : '📁 Upload Background Music'}
                </label>
                {backgroundAudio && (
                  <button 
                    onClick={() => setBackgroundAudio(null)}
                    className="btn-remove-audio"
                    title="Remove background audio"
                  >
                    ✖️
                  </button>
                )}
              </div>
              {backgroundAudio && (
                <div className="audio-volume-control">
                  <label>
                    Background Audio Volume: {backgroundAudioVolume}%
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={backgroundAudioVolume}
                      onChange={(e) => setBackgroundAudioVolume(e.target.value)}
                      className="audio-volume-slider"
                    />
                  </label>
                  <p className="audio-hint">Original video audio will be reduced to 70% when mixing</p>
                </div>
              )}
            </div>

            {previewUrl && (
              <div className="preview-section">
                <h3>🎬 Preview Active</h3>
                <p style={{ color: '#28a745', fontWeight: '600', marginBottom: '1rem', padding: '0.75rem', background: '#d4edda', borderRadius: '8px', border: '1px solid #c3e6cb' }}>
                  ✓ Main video is showing preview with all edits applied (trim, filters, zoom, subtitles)
                </p>
                <button 
                  onClick={() => {
                    if (previewUrl) {
                      URL.revokeObjectURL(previewUrl);
                    }
                    setPreviewUrl(null);
                    // Reload original video
                    if (videoRef.current) {
                      videoRef.current.src = videoUrl;
                      videoRef.current.load();
                    }
                  }}
                  className="btn-secondary"
                  style={{ width: '100%' }}
                >
                  Reset to Original Video
                </button>
              </div>
            )}

            <div className="auto-preview-control">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '1rem' }}>
                <input
                  type="checkbox"
                  checked={autoPreview}
                  onChange={(e) => {
                    setAutoPreview(e.target.checked);
                    // If enabling auto-preview and we have clips, generate preview immediately
                    if (e.target.checked && clips.length > 0) {
                      setTimeout(() => handlePreview(), 500);
                    }
                  }}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.95rem', fontWeight: '500' }}>
                  🔄 Auto Preview (automatically update preview when changes are made)
                </span>
              </label>
              {autoPreview && (
                <p style={{ fontSize: '0.85rem', color: '#6c757d', marginTop: '-0.5rem', marginBottom: '1rem', paddingLeft: '1.75rem' }}>
                  Preview will update automatically 1.5 seconds after you stop making changes
                </p>
              )}
            </div>

            <div className="action-buttons">
              <button
                onClick={handlePreview}
                disabled={isGeneratingPreview || clips.length === 0}
                className="btn-preview"
              >
                {isGeneratingPreview ? '⏳ Generating Preview...' : '👁️ Preview Video'}
              </button>
              <button
                onClick={handleTrim}
                disabled={isProcessing || startTime >= endTime}
                className="btn-primary"
              >
                {isProcessing ? '⏳ Processing...' : '🚀 Process Video'}
              </button>
              {downloadUrl && (
                <button onClick={handleDownload} className="btn-success">
                  ⬇️ Download Edited Video
                </button>
              )}
            </div>
          </div>
          </div>
          
          {/* Time Tooltip */}
          {tooltip.show && (
            <div
              ref={tooltipRef}
              className="timeline-tooltip"
              style={{
                position: 'fixed',
                left: `${tooltip.x}px`,
                top: `${tooltip.y}px`,
                pointerEvents: 'none',
                zIndex: 10000
              }}
            >
              {tooltip.text}
            </div>
          )}
        </>
        )}
    </div>
  );
};

export default VideoEditor;
