"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import {
  BookOpen,
  ShoppingCart,
  Upload,
  Repeat,
  User,
  CreditCard,
  MessageCircle,
  ArrowLeft,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0, 0, 0.2, 1] as const },
  }),
};

export default function HowToUsePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container py-12">
        <motion.div
          className="mx-auto max-w-4xl"
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={0}
        >
          <h1 className="font-display text-4xl font-bold text-foreground md:text-5xl">
            How to Use LearnXchange
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Your complete guide to buying, selling, and exchanging learning resources
          </p>
        </motion.div>

        {/* Getting Started */}
        <motion.section
          className="mx-auto mt-12 max-w-4xl"
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={1}
        >
          <h2 className="font-display text-2xl font-semibold text-foreground">
            Getting Started
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">1. Create an Account</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Sign up for free with your email. Complete your profile to start using the platform.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <BookOpen className="h-5 w-5 text-accent" />
                </div>
                <h3 className="font-semibold text-foreground">2. Explore Courses</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Browse courses by category, check ratings, and find what you need to learn.
                </p>
              </CardContent>
            </Card>
          </div>
        </motion.section>

        {/* For Buyers */}
        <motion.section
          className="mx-auto mt-12 max-w-4xl"
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={2}
        >
          <h2 className="font-display text-2xl font-semibold text-foreground">
            Buying Courses
          </h2>
          <div className="mt-6 space-y-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <ShoppingCart className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Purchase Process</h3>
                    <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                      <li>• Browse courses and click on one you like</li>
                      <li>• Click "Buy Now" and proceed to checkout</li>
                      <li>• Complete payment securely via Chapa</li>
                      <li>• Access your purchased course in "My Learning"</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                    <CreditCard className="h-5 w-5 text-warning" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Payment Methods</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      We accept payments via Chapa, supporting Telebirr, CBE Birr, and major credit cards.
                      All transactions are secure and encrypted.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.section>

        {/* For Sellers */}
        <motion.section
          className="mx-auto mt-12 max-w-4xl"
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={3}
        >
          <h2 className="font-display text-2xl font-semibold text-foreground">
            Selling Your Courses
          </h2>
          <div className="mt-6 space-y-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                    <Upload className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Upload & Sell</h3>
                    <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                      <li>• Go to Dashboard and click "Create Course"</li>
                      <li>• Fill in course details, description, and price</li>
                      <li>• Upload course materials (PDFs, videos, etc.)</li>
                      <li>• Set availability: For Sale, For Exchange, or Both</li>
                      <li>• Publish and wait for buyers!</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10">
                    <CreditCard className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Receiving Earnings</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      When someone buys your course, earnings are held for 3 days (holding period).
                      After that, you can request a withdrawal to your bank account or mobile money.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.section>

        {/* Exchanges */}
        <motion.section
          className="mx-auto mt-12 max-w-4xl"
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={4}
        >
          <h2 className="font-display text-2xl font-semibold text-foreground">
            Exchanging Courses
          </h2>
          <div className="mt-6 space-y-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                    <Repeat className="h-5 w-5 text-warning" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">How Exchanges Work</h3>
                    <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                      <li>• Find a course marked "For Exchange"</li>
                      <li>• Click "Request Exchange" and select a course to offer</li>
                      <li>• The owner reviews your request</li>
                      <li>• If accepted, you both gain access to each other's courses</li>
                      <li>• No money involved — pure knowledge sharing!</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.section>

        {/* Tips */}
        <motion.section
          className="mx-auto mt-12 max-w-4xl"
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={5}
        >
          <h2 className="font-display text-2xl font-semibold text-foreground">
            Tips for Success
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <h3 className="font-medium text-foreground">Build Reputation</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Rate courses you've taken. Good ratings help sellers and guide other buyers.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <h3 className="font-medium text-foreground">Quality Matters</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Upload detailed, well-organized courses. Better quality = more sales!
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <h3 className="font-medium text-foreground">Stay Active</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Regularly update your courses and respond to exchange requests promptly.
                </p>
              </CardContent>
            </Card>
          </div>
        </motion.section>

        {/* Support */}
        <motion.section
          className="mx-auto mt-12 max-w-4xl"
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={6}
        >
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-8 text-center">
              <MessageCircle className="mx-auto h-10 w-10 text-primary" />
              <h3 className="mt-4 font-display text-xl font-semibold text-foreground">
                Need More Help?
              </h3>
              <p className="mt-2 text-muted-foreground">
                Contact our support team for any questions or issues.
              </p>
              <Button className="mt-4" asChild>
                <Link href="/contact">Contact Support</Link>
              </Button>
            </CardContent>
          </Card>
        </motion.section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container">
          <p className="text-center text-sm text-muted-foreground">
            © 2026 LearnXchange. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
