import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Slider, Spin, Tooltip, Typography } from 'antd';
import {
  AudioMutedOutlined,
  CaretRightOutlined,
  PauseOutlined,
  ReloadOutlined,
  SoundOutlined,
  ThunderboltOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { DiscussionTurnDto } from '../../api/discussions';

const { Text } = Typography;

interface AudioItem {
  id: string;
  url: string;
  participantId: string | null;
}

interface ScheduledClip {
  index: number;
  startTime: number;
  endTime: number;
  offset: number;
  source: AudioBufferSourceNode;
}

interface LiveVoiceBarProps {
  runId: string | null;
  runStatus: 'pending' | 'running' | 'done' | 'error' | undefined;
  runStartedAt: string | null | undefined;
  turns: DiscussionTurnDto[];
  fallbackUrl: string | null | undefined;
  speakerNames: Record<string, string>;
  waitingMessage: string;
  audioAvailable: boolean;
  /** Fired when playback advances into a new turn clip (index into the sorted turn list). */
  onActiveTurnIndexChange?: (index: number) => void;
  /** Fired once per schedule generation when playback has drained everything it will ever
   * play for this run (run no longer generating, all fetched clips played out) or the audio
   * path failed fatally — lets the transcript release any still-hidden turns. */
  onPlaybackEnded?: () => void;
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function contiguousAudioItems(
  turns: DiscussionTurnDto[],
  fallbackUrl: string | null | undefined
): AudioItem[] {
  const items: AudioItem[] = [];
  for (const turn of [...turns].sort((a, b) => a.turnIndex - b.turnIndex)) {
    if (!turn.audioUrl) break;
    items.push({ id: turn.id, url: turn.audioUrl, participantId: turn.participantId });
  }
  if (items.length === 0 && fallbackUrl) {
    return [{ id: `recording:${fallbackUrl}`, url: fallbackUrl, participantId: null }];
  }
  return items;
}

export function LiveVoiceBar({
  runId,
  runStatus,
  runStartedAt,
  turns,
  fallbackUrl,
  speakerNames,
  waitingMessage,
  audioAvailable,
  onActiveTurnIndexChange,
  onPlaybackEnded
}: LiveVoiceBarProps) {
  const { t } = useTranslation();
  const isLive = runStatus === 'pending' || runStatus === 'running';
  const items = useMemo(() => contiguousAudioItems(turns, fallbackUrl), [fallbackUrl, turns]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const buffersRef = useRef(new Map<string, AudioBuffer>());
  const fetchingRef = useRef(new Map<string, AbortController>());
  const scheduledRef = useRef<ScheduledClip[]>([]);
  const scheduledEndRef = useRef(0);
  const nextIndexRef = useRef(0);
  const pendingOffsetRef = useRef(0);
  const generationRef = useRef(0);
  const userPausedRef = useRef(false);
  const announcedIndexRef = useRef(-1);
  const endedGenerationRef = useRef(-1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [bufferVersion, setBufferVersion] = useState(0);
  const [retryVersion, setRetryVersion] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [needsStart, setNeedsStart] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [logicalPosition, setLogicalPosition] = useState(0);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [audioError, setAudioError] = useState(false);

  const clearScheduled = useCallback(() => {
    generationRef.current += 1;
    for (const clip of scheduledRef.current) {
      clip.source.onended = null;
      try { clip.source.stop(); } catch { /* already stopped */ }
      clip.source.disconnect();
    }
    scheduledRef.current = [];
  }, []);

  const cumulativeDuration = useCallback((endIndex: number): number => {
    let duration = 0;
    for (let index = 0; index < endIndex; index++) {
      duration += buffersRef.current.get(itemsRef.current[index]?.id)?.duration ?? 0;
    }
    return duration;
  }, []);

  const scheduleReady = useCallback(() => {
    const context = contextRef.current;
    const analyser = analyserRef.current;
    if (!context || !analyser) return;

    const generation = generationRef.current;
    let scheduledAny = false;
    while (nextIndexRef.current < itemsRef.current.length) {
      const index = nextIndexRef.current;
      const item = itemsRef.current[index];
      const buffer = buffersRef.current.get(item.id);
      if (!buffer) break;

      const offset = pendingOffsetRef.current;
      pendingOffsetRef.current = 0;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(analyser);
      const startTime = Math.max(context.currentTime + 0.04, scheduledEndRef.current);
      const endTime = startTime + Math.max(0, buffer.duration - offset);
      scheduledRef.current.push({ index, startTime, endTime, offset, source });
      scheduledEndRef.current = endTime;
      nextIndexRef.current = index + 1;
      scheduledAny = true;

      source.onended = () => {
        if (generationRef.current !== generation) return;
        if (index + 1 >= nextIndexRef.current) setBuffering(isLive);
      };
      source.start(startTime, offset);
    }

    if (!scheduledAny) return;
    setAudioError(false);
    if (!userPausedRef.current) {
      context.resume()
        .then(() => {
          setPlaying(context.state === 'running');
          setNeedsStart(context.state !== 'running');
        })
        .catch(() => {
          setPlaying(false);
          setNeedsStart(true);
        });
    }
  }, [isLive]);

  useEffect(() => {
    clearScheduled();
    buffersRef.current.clear();
    for (const controller of fetchingRef.current.values()) controller.abort();
    fetchingRef.current.clear();
    scheduledEndRef.current = 0;
    nextIndexRef.current = 0;
    pendingOffsetRef.current = 0;
    userPausedRef.current = false;
    setBufferVersion(0);
    setPlaying(false);
    setNeedsStart(false);
    setBuffering(true);
    setCurrentIndex(0);
    setLogicalPosition(0);
    setAudioError(false);
    announcedIndexRef.current = -1;
    endedGenerationRef.current = -1;

    if (!audioAvailable || !runId || typeof AudioContext === 'undefined') {
      setAudioError(audioAvailable && Boolean(runId));
      return;
    }

    const context = new AudioContext();
    const analyser = context.createAnalyser();
    const gain = context.createGain();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.78;
    analyser.connect(gain);
    gain.connect(context.destination);
    gain.gain.value = volume;
    contextRef.current = context;
    analyserRef.current = analyser;
    gainRef.current = gain;

    return () => {
      clearScheduled();
      for (const controller of fetchingRef.current.values()) controller.abort();
      fetchingRef.current.clear();
      contextRef.current = null;
      analyserRef.current = null;
      gainRef.current = null;
      void context.close();
    };
    // A selected run owns one graph. Volume updates through the GainNode effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioAvailable, clearScheduled, runId]);

  useEffect(() => {
    const context = contextRef.current;
    if (!context) return;

    for (const item of items) {
      if (buffersRef.current.has(item.id) || fetchingRef.current.has(item.id)) continue;
      const controller = new AbortController();
      fetchingRef.current.set(item.id, controller);
      fetch(item.url, { credentials: 'include', signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error(`audio_${response.status}`);
          return response.arrayBuffer();
        })
        .then((data) => context.decodeAudioData(data))
        .then((buffer) => {
          buffersRef.current.set(item.id, buffer);
          setBufferVersion((version) => version + 1);
        })
        .catch((error) => {
          if ((error as Error).name !== 'AbortError') setAudioError(true);
        })
        .finally(() => fetchingRef.current.delete(item.id));
    }
  }, [items, retryVersion]);

  useEffect(() => {
    scheduleReady();
  }, [bufferVersion, items.length, scheduleReady]);

  useEffect(() => {
    const gain = gainRef.current;
    if (gain) gain.gain.value = muted ? 0 : volume;
  }, [muted, volume]);

  useEffect(() => {
    if (!isLive || !runStartedAt) return;
    const update = () => setSessionElapsed(Math.max(0, (Date.now() - Date.parse(runStartedAt)) / 1000));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [isLive, runStartedAt]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const context = contextRef.current;
      if (!context) return;
      const clip = scheduledRef.current.find(
        (candidate) => context.currentTime >= candidate.startTime && context.currentTime <= candidate.endTime
      );
      if (!clip) {
        // Drained: run finished generating, every fetched clip was scheduled and has played
        // out past its end. Fire once per schedule generation (seek/goLive re-arms).
        if (
          !isLive &&
          scheduledRef.current.length > 0 &&
          nextIndexRef.current >= itemsRef.current.length &&
          context.state === 'running' &&
          context.currentTime > scheduledEndRef.current &&
          endedGenerationRef.current !== generationRef.current
        ) {
          endedGenerationRef.current = generationRef.current;
          onPlaybackEnded?.();
        }
        return;
      }
      setCurrentIndex((index) => index === clip.index ? index : clip.index);
      if (announcedIndexRef.current !== clip.index) {
        announcedIndexRef.current = clip.index;
        onActiveTurnIndexChange?.(clip.index);
      }
      setBuffering(false);
      setLogicalPosition(
        cumulativeDuration(clip.index) + clip.offset + context.currentTime - clip.startTime
      );
    }, 200);
    return () => window.clearInterval(timer);
  }, [cumulativeDuration, isLive, onActiveTurnIndexChange, onPlaybackEnded]);

  // A fatal audio error means playback will never reach the remaining turns - release them.
  useEffect(() => {
    if (audioError) onPlaybackEnded?.();
  }, [audioError, onPlaybackEnded]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const values = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;

    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;
      }
      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      analyser.getByteFrequencyData(values);
      // Feed the live amplitude to the CSS layer so the active speaker's ring
      // pulses with the actual voice (see .speaker-voice).
      let sum = 0;
      for (let index = 0; index < values.length; index++) sum += values[index];
      const level = playing && !reducedMotion ? sum / values.length / 255 : 0;
      document.documentElement.style.setProperty('--voice-level', level.toFixed(3));
      const bars = Math.min(40, values.length);
      const gap = 3;
      const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars);
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#c4b5fd');
      gradient.addColorStop(1, '#4f46e5');
      context.fillStyle = gradient;
      for (let index = 0; index < bars; index++) {
        const signal = playing && !reducedMotion ? values[index] / 255 : 0.12 + (index % 5) * 0.025;
        const barHeight = Math.max(3, signal * height);
        const x = index * (barWidth + gap);
        context.beginPath();
        context.roundRect(x, (height - barHeight) / 2, barWidth, barHeight, barWidth / 2);
        context.fill();
      }
      if (playing && !reducedMotion) frame = window.requestAnimationFrame(draw);
    };
    draw();
    return () => {
      window.cancelAnimationFrame(frame);
      document.documentElement.style.setProperty('--voice-level', '0');
    };
  }, [bufferVersion, playing]);

  const startListening = useCallback(() => {
    const context = contextRef.current;
    if (!context) return;
    userPausedRef.current = false;
    scheduleReady();
    context.resume()
      .then(() => {
        setPlaying(true);
        setNeedsStart(false);
      })
      .catch(() => setNeedsStart(true));
  }, [scheduleReady]);

  const togglePlayback = useCallback(() => {
    const context = contextRef.current;
    if (!context) return;
    if (context.state === 'running') {
      userPausedRef.current = true;
      void context.suspend().then(() => setPlaying(false));
    } else {
      startListening();
    }
  }, [startListening]);

  const restartSchedule = useCallback((startIndex: number, offset = 0) => {
    const context = contextRef.current;
    if (!context) return;
    clearScheduled();
    nextIndexRef.current = startIndex;
    pendingOffsetRef.current = offset;
    scheduledEndRef.current = context.currentTime + 0.04;
    setCurrentIndex(startIndex);
    setBuffering(true);
    scheduleReady();
  }, [clearScheduled, scheduleReady]);

  const goLive = useCallback(() => {
    let newestDecoded = 0;
    for (let index = 0; index < itemsRef.current.length; index++) {
      if (buffersRef.current.has(itemsRef.current[index].id)) newestDecoded = index;
    }
    userPausedRef.current = false;
    restartSchedule(newestDecoded);
    void contextRef.current?.resume().then(() => setPlaying(true));
  }, [restartSchedule]);

  const totalDuration = useMemo(
    () => items.reduce((sum, item) => sum + (buffersRef.current.get(item.id)?.duration ?? 0), 0),
    // Newly decoded buffers change duration without changing item identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bufferVersion, items]
  );

  const seek = useCallback((position: number) => {
    let remaining = position;
    let index = 0;
    for (; index < itemsRef.current.length; index++) {
      const duration = buffersRef.current.get(itemsRef.current[index].id)?.duration ?? 0;
      if (remaining <= duration) break;
      remaining -= duration;
    }
    restartSchedule(Math.min(index, Math.max(0, itemsRef.current.length - 1)), remaining);
    setLogicalPosition(position);
  }, [restartSchedule]);

  const latestDecodedIndex = items.reduce(
    (latest, item, index) => buffersRef.current.has(item.id) ? index : latest,
    0
  );
  const behindLive = isLive && currentIndex < latestDecodedIndex;
  const activeItem = items[currentIndex];
  const speaker = activeItem?.participantId ? speakerNames[activeItem.participantId] : null;
  const unavailable = !audioAvailable || runStatus === 'error' || (!isLive && items.length === 0);

  return (
    <section className="live-spectrum" aria-label={t('studio.onAir')}>
      <div className="live-spectrum-main">
        <Tooltip title={playing ? t('studio.pauseListening') : t('studio.startListening')}>
          <Button
            type="primary"
            shape="circle"
            className="live-spectrum-play"
            icon={playing ? <PauseOutlined /> : <CaretRightOutlined />}
            disabled={unavailable}
            aria-label={playing ? t('studio.pauseListening') : t('studio.startListening')}
            onClick={togglePlayback}
          />
        </Tooltip>

        <div className="live-spectrum-copy">
          <div className="live-spectrum-title">
            {isLive && <span className="live-spectrum-live"><span />{t('studio.onAir')}</span>}
            <strong>{speaker ?? (isLive ? t('studio.liveStudio') : t('studio.listenBack'))}</strong>
          </div>
          <Text type="secondary">
            {!audioAvailable
              ? t('studio.audioNotConfigured')
              : audioError
              ? t('studio.audioStreamError')
              : buffering && isLive
                ? waitingMessage
                : isLive
                  ? t('studio.liveFor', { time: formatTime(sessionElapsed) })
                  : t('studio.recordingTime', {
                      current: formatTime(logicalPosition),
                      total: formatTime(totalDuration)
                    })}
          </Text>
          {!audioAvailable && <WarningOutlined className="live-spectrum-warning-icon" aria-hidden="true" />}
        </div>

        <canvas ref={canvasRef} className="live-spectrum-canvas" aria-hidden="true" />

        <div className="live-spectrum-actions">
          {behindLive && (
            <Button icon={<ThunderboltOutlined />} onClick={goLive}>
              {t('studio.goLive')}
            </Button>
          )}
          {audioError && (
            <Tooltip title={t('studio.retryAudio')}>
              <Button
                shape="circle"
                icon={<ReloadOutlined />}
                aria-label={t('studio.retryAudio')}
                onClick={() => {
                  setAudioError(false);
                  for (const controller of fetchingRef.current.values()) controller.abort();
                  fetchingRef.current.clear();
                  setRetryVersion((version) => version + 1);
                }}
              />
            </Tooltip>
          )}
          <Tooltip title={muted ? t('studio.unmute') : t('studio.mute')}>
            <Button
              type="text"
              shape="circle"
              icon={muted ? <AudioMutedOutlined /> : <SoundOutlined />}
              aria-label={muted ? t('studio.unmute') : t('studio.mute')}
              disabled={unavailable}
              onClick={() => setMuted((value) => !value)}
            />
          </Tooltip>
          <Slider
            className="live-spectrum-volume"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            aria-label={t('studio.volume')}
            disabled={unavailable}
            onChange={(value) => {
              setMuted(false);
              setVolume(value);
            }}
          />
        </div>
      </div>

      {!isLive && totalDuration > 0 && (
        <div className="live-spectrum-recording">
          <span>{formatTime(logicalPosition)}</span>
          <Slider
            min={0}
            max={totalDuration}
            step={0.1}
            value={Math.min(logicalPosition, totalDuration)}
            aria-label={t('studio.seekRecording')}
            onChange={seek}
          />
          <span>{formatTime(totalDuration)}</span>
        </div>
      )}

      {needsStart && (
        <div className="live-spectrum-notice" role="status">
          <Text type="secondary">{t('studio.audioAutoplayBlocked')}</Text>
          <Button size="small" onClick={startListening}>{t('studio.startListening')}</Button>
        </div>
      )}

      {buffering && isLive && items.length > 0 && !audioError && (
        <div className="live-spectrum-buffering" role="status">
          <Spin size="small" />
          <span>{t('studio.bufferingAudio')}</span>
        </div>
      )}
    </section>
  );
}
