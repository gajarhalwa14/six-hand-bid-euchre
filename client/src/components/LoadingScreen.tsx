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
        window.setTimeout(onComplete, 1000);
    };

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const tryPlay = () => {
            video.play().catch(() => {
                // Autoplay blocked — advance once the browser allows interaction elsewhere.
                window.setTimeout(finish, 1200);
            });
        };

        tryPlay();
        video.addEventListener('ended', finish);
        return () => video.removeEventListener('ended', finish);
    }, []);

    return (
        <div className={`loading-screen ${fading ? 'fade-out' : ''}`}>
            <video
                ref={videoRef}
                className="loading-video"
                src="/loadingscreenVideo2.mp4"
                muted
                playsInline
                preload="auto"
            />
        </div>
    );
};
