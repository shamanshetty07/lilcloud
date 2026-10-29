import logo from "../assets/logo.png";

export const Logo = ({ size = 28 }: { size?: number }) => (
  <img src={logo} alt="lilcloud" height={size} style={{ height: size, width: "auto" }} draggable={false} />
);
