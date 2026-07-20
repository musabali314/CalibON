import { ArrowDown, ArrowRight, Check, Play } from "lucide-react";
import CalibrationScene from "../three/CalibrationScene";

interface HeroProps {
  onLaunch: () => void;
  onOpenDemo: () => void;
}

const trustItems = ["No server uploads", "No installation", "Free and open source"];

function Hero({ onLaunch, onOpenDemo }: HeroProps) {
  return (
    <section className="hero" id="top">
      <div className="hero__background" aria-hidden="true">
        <div className="hero__grid" />
        <div className="hero__glow hero__glow--primary" />
        <div className="hero__glow hero__glow--secondary" />
      </div>

      <div className="page-container hero__layout">
        <div className="hero__content">
          <div className="chip chip-accent"><span className="status-dot status-dot-pulse" />Browser-based camera calibration</div>
          <div className="hero__heading-group">
            <h1 className="display-heading">Your camera,<span className="gradient-text"> precisely calibrated.</span></h1>
            <p className="hero__description">Upload calibration images, inspect dataset quality, estimate camera intrinsics and export directly to ROS, OpenCV or Kalibr. Everything runs locally in your browser.</p>
          </div>
          <div className="hero__actions">
            <button className="button button-primary" type="button" onClick={onLaunch}>Start calibrating <ArrowRight size={18} /></button>
            <button className="button button-secondary" type="button" onClick={onOpenDemo}><Play size={17} />Explore demo</button>
          </div>
          <div className="hero__trust">
            {trustItems.map((item) => <span key={item}><Check size={15} />{item}</span>)}
          </div>
        </div>

        <div className="hero__visual">
          <div className="hero-calibration-scene"><CalibrationScene /></div>
        </div>
      </div>

      <button className="hero__scroll-indicator" type="button" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })} aria-label="Scroll to features">
        <span>Explore</span><ArrowDown size={16} />
      </button>
    </section>
  );
}

export default Hero;
