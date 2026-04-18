import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import Providers from './components/providers'
import TrialBanner from './components/TrialBanner'
import { MetaPixelTracker } from './components/MetaPixelTracker'

const META_PIXEL_ID = '1499602704618597'

const BASE_URL = 'https://scout.clientbloom.ai'
const OG_IMAGE = `${BASE_URL}/og-image.png`

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: 'Scout by ClientBloom — LinkedIn Relationship Intelligence',
  description: 'Scout monitors your LinkedIn prospects, scores their posts 1–10 by ICP relevance, and tells you exactly when to engage — so you warm up deals before you ever pitch. 7-day free trial.',
  keywords: 'LinkedIn relationship intelligence, LinkedIn prospect monitoring, AI LinkedIn engagement, warm LinkedIn outreach, LinkedIn comment tool',
  openGraph: {
    title: 'Scout by ClientBloom — LinkedIn Relationship Intelligence',
    description: 'Monitor prospects, score posts by ICP relevance, engage at exactly the right moment. 7-day free trial.',
    type: 'website',
    url: BASE_URL,
    siteName: 'Scout by ClientBloom',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Scout by ClientBloom — LinkedIn Relationship Intelligence',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Scout by ClientBloom — LinkedIn Relationship Intelligence',
    description: 'LinkedIn relationship intelligence. Monitor prospects, score posts, engage at exactly the right moment.',
    images: [OG_IMAGE],
    site: '@clientbloom',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
}

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Scout by ClientBloom',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'LinkedIn relationship intelligence platform that monitors prospects, scores posts by ICP relevance using AI, and generates personalized comment starters to warm up deals before you pitch.',
  offers: {
    '@type': 'AggregateOffer',
    lowPrice: '49.00',
    highPrice: '249.00',
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
    description: '7-day free trial included. Plans from $49/mo.',
    offerCount: '3',
  },
  featureList: [
    'AI post scoring 1-10 by ICP relevance',
    'LinkedIn prospect profile monitoring',
    'LinkedIn keyword search monitoring',
    'Personalized comment starter generation',
    'CRM integration (GoHighLevel and HubSpot)',
    'Multi-tenant agency workspace',
    'Custom scoring prompts per tenant',
    'Slack daily digest',
    'Searchable post history archive',
  ],
  url: BASE_URL,
  provider: {
    '@type': 'Organization',
    name: 'ClientBloom',
    url: 'https://clientbloom.ai',
    logo: {
      '@type': 'ImageObject',
      url: `${BASE_URL}/logo.png`,
    },
  },
  screenshot: OG_IMAGE,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {/* Meta Pixel base code — fires PageView on every route load.
            Custom events (SubmitApplication, etc) are fired from client
            components via lib/meta-pixel.ts. */}
        <Script
          id="meta-pixel-base"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${META_PIXEL_ID}');
              fbq('track', 'PageView');
            `,
          }}
        />
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
      </head>
      <body className="min-h-screen antialiased">
        <Providers>
          <MetaPixelTracker />
          {children}
        </Providers>
      </body>
    </html>
  )
}
