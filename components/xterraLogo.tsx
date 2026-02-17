import SafeImage from './SafeImage';

interface XterraLogoProps {
  className?: string;
}

const XterraLogo: React.FC<XterraLogoProps> = ({ className = '' }) => {
  return (
    <>
      {/* Light mode */}
      <SafeImage
        fileName="xterra-logo.jpg"
        alt="X-TERRA"
        className={`block dark:hidden ${className}`}
      />

      {/* Dark mode */}
      <SafeImage
        fileName="Xterra-White.png"
        alt="X-TERRA"
        className={`hidden dark:block ${className}`}
      />
    </>
  );
};

export default XterraLogo;
