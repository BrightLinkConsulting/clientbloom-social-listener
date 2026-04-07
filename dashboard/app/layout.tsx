import type { Metadata } from 'next'
import Providers from './components/providers'

export const metadata: Metadata = {
  title: 'Scout by ClientBloom — LinkedIn Relationship Intelligence',
  description: 'Scout monitors your LinkedIn prospects, scores their posts 1–10 by ICP relevance, and tells you exactly when to engage — so you warm up deals before you ever pitch. 14-day free trial.',
  keywords: 'LinkedIn relationship intelligence, LinkedIn prospect monitoring, AI LinkedIn engagement, warm LinkedIn outreach, LinkedIn comment tool',
  openGraph: {
    title: 'Scout by ClientBloom — LinkedIn Relationship Intelligence',
    description: 'Monitor prospects, score posts by ICP relevance, engage at exactly the right moment. 14-day free trial.',
    type: 'website',
    url: 'https://app.clientbloom.ai',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Scout by ClientBloom',
    description: 'LinkedIn relationship intelligence. Monitor prospects, score posts, engage at exactly the right moment.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <script src="https://cdn.tailwindcss.com" async={false} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              tailwind.config = {
                theme: {
                  extend: {
                    colors: {
                      brand: { 500: '#4F6BFF', 600: '#3D57F5' }
                    }
                  }
                }
              }
            `
          }}
        />
        <style dangerouslySetInnerHTML={{__html: `
          body { background-color: #0a0c10; color: #e2e8f0; margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; }
          * { box-sizing: border-box; }
        `}} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Scout by ClientBloom',
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web',
              description: 'LinkedIn relationship intelligence platform that monitors prospects, scores posts by ICP relevance using AI, and generates personalized comment starters to warm up deals before you pitch.',
              offers: {
                '@type': 'Offer',
                price: '79.00',
                priceCurrency: 'USD',
                availability: 'https://schema.org/InStock',
                description: '14-day free trial included'
              },
              featureList: [
                'AI post scoring 1-10 by ICP relevance',
                'LinkedIn prospect profile monitoring',
                'LinkedIn keyword search monitoring',
                'Personalized comment starter generation',
                'CRM integration',
                'Multi-tenant agency workspace',
                'Custom scoring prompts per tenant'
              ],
              url: 'https://app.clientbloom.ai',
              provider: {
                '@type': 'Organization',
                name: 'ClientBloom',
                url: 'https://clientbloom.ai'
              }
            })
          }}
        />
      </head>
      <body className="min-h-screen bg-[#0a0c10] text-slate-200 antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
