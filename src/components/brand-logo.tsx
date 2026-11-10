import Link from "next/link";

export default function BrandLogo({className="logo"}:{className?:string}) {
  return <Link href="/" className={`brand-logo ${className}`} aria-label="Digi Biashara home">
    <img src="https://res.cloudinary.com/azrvy9ub/image/upload/f_auto,q_auto,w_240/v1794349210/1793911899888.jpg" alt="Digi Biashara" width={180} height={64} />
  </Link>;
}
