import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import MobileActionBar from './components/MobileActionBar.jsx';
import Hero from './sections/Hero.jsx';
import Services from './sections/Services.jsx';
import HowItWorks from './sections/HowItWorks.jsx';
import WhoWeServe from './sections/WhoWeServe.jsx';
import About from './sections/About.jsx';
import QuoteForm from './sections/QuoteForm.jsx';
import ServiceArea from './sections/ServiceArea.jsx';
import FAQ from './sections/FAQ.jsx';

export default function App() {
  return (
    <>
      <Header />
      <main id="main">
        <Hero />
        <Services />
        <HowItWorks />
        <WhoWeServe />
        <About />
        <QuoteForm />
        <ServiceArea />
        <FAQ />
      </main>
      <Footer />
      <MobileActionBar />
    </>
  );
}
