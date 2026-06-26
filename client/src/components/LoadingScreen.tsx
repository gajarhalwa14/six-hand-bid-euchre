import React, { useEffect, useRef, useState } from 'react';
import './LoadingScreen.css';

interface Props {
    onComplete: () => void;
}

export const LoadingScreen: React.FC<Props> = ({ onComplete }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [fading, setFading] = useState(false);

    const finish = () => {
        if (fading) return;
        setFading(true);
        window.setTimeout(onComplete, 700);
    };

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const tryPlay = () => {
            video.play().catch(() => {
                // Autoplay blocked — skip to login after a short beat.
                window.setTimeout(finish, 1200);
            });
        };

        tryPlay();
        video.addEventListener('ended', finish);
        return () => video.removeEventListener('ended', finish);
    }, []);

    return (
        <div
            className={`loading-screen ${fading ? 'fade-out' : ''}`}
            onClick={finish}
            role="presentation"
        >
            <video
                ref={videoRef}
                className="loading-video"
                src="/loadingScreenVideo.mp4"
                muted
                playsInline
                preload="auto"
            />
            <div className="loading-skip-hint">Tap to skip</div>
        </div>
    );
};
