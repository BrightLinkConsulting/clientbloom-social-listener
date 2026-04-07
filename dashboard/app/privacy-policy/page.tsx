import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Scout by ClientBloom',
  description: 'How Scout by ClientBloom collects, uses, and protects your personal data.',
  openGraph: {
    title: 'Privacy Policy — Scout by ClientBloom',
    url: 'https://scout.clientbloom.ai/privacy-policy',
  },
}

export default function PrivacyPolicy() {
  const lastUpdated = 'April 7, 2026'

  return (
    <div className="min-h-screen bg-[#0A0C14] text-slate-300">
      <nav className="border-b border-slate-800/50 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-white font-bold tracking-tight">
            Scout <span className="text-slate-400 font-normal text-sm">by ClientBloom</span>
          </Link>
          <Link href="/sign-in" className="text-slate-400 hover:text-slate-200 text-sm transition-colors">
            Sign in
          </Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-white mb-3">Privacy Policy</h1>
        <p className="text-slate-500 text-sm mb-12">Last updated: {lastUpdated}</p>

        <div className="prose prose-invert prose-slate max-w-none space-y-10 text-slate-300 leading-relaxed">

          <section>
            <p>
              Scout by ClientBloom (&ldquo;Scout,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is operated by ClientBloom, a product of BrightLink Consulting. This Privacy Policy explains how we collect, use, disclose, and protect information when you use our LinkedIn relationship intelligence platform at scout.clientbloom.ai (the &ldquo;Service&rdquo;).
            </p>
            <p className="mt-4">
              By using the Service, you agree to the collection and use of information in accordance with this policy. If you do not agree, please discontinue use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">1. Information We Collect</h2>
            <h3 className="text-base font-medium text-slate-200 mb-2">Account Information</h3>
            <p>When you create an account or subscribe, we collect your name, email address, and billing information (processed by Stripe — we do not store full card numbers).</p>

            <h3 className="text-base font-medium text-slate-200 mt-6 mb-2">LinkedIn Data You Provide</h3>
            <p>Scout monitors LinkedIn activity on your behalf. To do this, you provide LinkedIn profile URLs and keyword search terms. We collect and store the publicly available LinkedIn post content associated with those profiles and keywords, as returned by our data provider (Apify). We do not access your personal LinkedIn account or credentials.</p>

            <h3 className="text-base font-medium text-slate-200 mt-6 mb-2">Usage Data</h3>
            <p>We collect information about how you interact with the Service, including pages visited, features used, scan history, and session timestamps. This data is used to improve the platform and diagnose issues.</p>

            <h3 className="text-base font-medium text-slate-200 mt-6 mb-2">Communications</h3>
            <p>When you contact us by email, we retain the content of those communications to respond to your requests and improve support quality.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">2. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-2 text-slate-300">
              <li>To provide, operate, and maintain the Service</li>
              <li>To process your subscription and send billing-related communications</li>
              <li>To monitor LinkedIn profiles and keywords you configure</li>
              <li>To generate AI-powered post scores and comment starters using Anthropic&apos;s Claude API</li>
              <li>To send transactional emails (welcome, password reset, team invitations) via Resend</li>
              <li>To detect and prevent fraud, abuse, or violations of our Terms of Service</li>
              <li>To comply with applicable legal obligations</li>
            </ul>
            <p className="mt-4">We do not sell your personal data to third parties. We do not use your data to train AI models.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">3. Third-Party Services</h2>
            <p className="mb-4">Scout integrates with the following third-party services to operate. Each is governed by its own privacy policy:</p>
            <div className="space-y-3">
              {[
                { name: 'Stripe', purpose: 'Payment processing and subscription management', url: 'https://stripe.com/privacy' },
                { name: 'Apify', purpose: 'LinkedIn public data collection on your behalf', url: 'https://apify.com/privacy-policy' },
                { name: 'Anthropic (Claude)', purpose: 'AI post scoring and comment generation', url: 'https://www.anthropic.com/privacy' },
                { name: 'Resend', purpose: 'Transactional email delivery', url: 'https://resend.com/privacy' },
                { name: 'Airtable', purpose: 'Backend data storage', url: 'https://www.airtable.com/privacy' },
                { name: 'Vercel', purpose: 'Application hosting and infrastructure', url: 'https://vercel.com/legal/privacy-policy' },
              ].map(({ name, purpose, url }) => (
                <div key={name} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#4F6BFF] hover:underline font-medium min-w-[120px]">{name}</a>
                  <span className="text-slate-400 text-sm">{purpose}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">4. Data Retention</h2>
            <p>We retain your account data and LinkedIn monitoring data for as long as your account is active. Upon cancellation or account deletion, your data is retained for 30 days to allow for reactivation, then permanently deleted. You may request immediate deletion by emailing <a href="mailto:info@clientbloom.ai" className="text-[#4F6BFF] hover:underline">info@clientbloom.ai</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">5. Data Security</h2>
            <p>We implement industry-standard security measures including encrypted data transmission (TLS), secure credential storage, and access controls. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">6. Your Rights</h2>
            <p className="mb-4">Depending on your location, you may have the following rights regarding your personal data:</p>
            <ul className="list-disc list-inside space-y-2 text-slate-300">
              <li><strong className="text-slate-200">Access:</strong> Request a copy of the data we hold about you</li>
              <li><strong className="text-slate-200">Correction:</strong> Request correction of inaccurate data</li>
              <li><strong className="text-slate-200">Deletion:</strong> Request deletion of your data (&ldquo;right to be forgotten&rdquo;)</li>
              <li><strong className="text-slate-200">Portability:</strong> Request your data in a portable format</li>
              <li><strong className="text-slate-200">Opt-out:</strong> Opt out of non-essential communications</li>
            </ul>
            <p className="mt-4">To exercise any of these rights, contact us at <a href="mailto:info@clientbloom.ai" className="text-[#4F6BFF] hover:underline">info@clientbloom.ai</a>. We will respond within 30 days.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">7. California Privacy Rights (CCPA)</h2>
            <p>California residents have additional rights under the California Consumer Privacy Act (CCPA), including the right to know what personal information is collected, the right to delete personal information, and the right to opt out of the sale of personal information. Scout does not sell personal information. To exercise your CCPA rights, email <a href="mailto:info@clientbloom.ai" className="text-[#4F6BFF] hover:underline">info@clientbloom.ai</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">8. Children&apos;s Privacy</h2>
            <p>The Service is intended for business use by adults 18 years of age and older. We do not knowingly collect personal information from children under 18. If you believe a child has provided us with personal information, contact us immediately at <a href="mailto:info@clientbloom.ai" className="text-[#4F6BFF] hover:underline">info@clientbloom.ai</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">9. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of material changes by email or by posting a prominent notice on the Service. Your continued use of the Service after changes take effect constitutes acceptance of the updated policy.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">10. Contact Us</h2>
            <p>If you have questions about this Privacy Policy or how we handle your data, contact us at:</p>
            <div className="mt-4 space-y-1 text-slate-300">
              <p className="font-medium text-white">BrightLink Consulting</p>
              <p>Scout by ClientBloom</p>
              <p><a href="mailto:info@clientbloom.ai" className="text-[#4F6BFF] hover:underline">info@clientbloom.ai</a></p>
            </div>
          </section>

        </div>
      </main>

      <footer className="border-t border-slate-800/50 py-8 px-6 mt-16">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-600">
          <span>© 2026 Scout by ClientBloom. All rights reserved.</span>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="hover:text-slate-400 transition-colors">Terms of Service</Link>
            <Link href="/privacy-policy" className="hover:text-slate-400 transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
