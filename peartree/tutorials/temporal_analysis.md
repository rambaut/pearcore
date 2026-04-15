---
layout: page
title: "Tutorial: Temporal Signal Analysis of a Virus Phylogeny"
permalink: /tutorials/temporal-analysis/
---

<p align="center">
  <img src="/logo/peartree.png" alt="PearTree logo" style="width:180px;" />
</p>

# Tutorial: Temporal Signal Analysis of a Virus Phylogeny

**Estimated time:** 30–45 minutes  
**Level:** Intermediate  
**Data:** Built-in Variola virus (VARV) example tree  
**Key feature:** Root-to-Tip (RTT) regression panel

---

## Overview

A fundamental step when analysing virus evolution is checking whether a phylogeny contains a **clock-like temporal signal** — that is, whether more-recently sampled genomes are consistently more diverged from the root than older ones. If they are, the divergence is accumulating at a roughly constant rate over time and the tree can be used as the basis for a molecular clock analysis.

This tutorial walks through that check using PearTree's built-in **Root-to-Tip (RTT) regression panel** and the built-in Variola virus (smallpox, VARV) dataset. Along the way we will also explore how the choice of root position dominates the apparent signal, and how PearTree's **Local** and **Global Temporal Root** tools can find the root that maximises the clock-like behaviour automatically.

> **Dataset note**  
> The VARV dataset is a collection of Variola virus (the causative agent of smallpox) complete genomes spanning several centuries, including ancient DNA recovered from archaeological specimens and 20th-century WHO reference strains. It provides a compelling example because it mixes very old sequences with modern ones and contains some known biological and sequencing outliers.

---

## 1. Loading the Tree

Open PearTree ([peartree.live](http://peartree.live) or the desktop application) and click **Open…** (or press **⌘O**).

In the *Open Tree File* dialog, go to the **Example** tab, but for this tutorial we need the VARV tree. Switch to the **File** tab and select the file `VARV.tree` from your working directory (or, if using the online app, paste the URL):

```
https://artic-network.github.io/peartree/data/VARV.tree
```

> **Desktop app users:** Choosing Open will go straight to the system file chooser. Navigate to `VARV.tree` and click Open.

When the dialog asks how to interpret the internal node labels, choose **bootstraps**. This tells PearTree to treat the values at internal nodes as bootstrap support values rather than, for example, posterior probabilities.

> <!-- FIGURE PLACEHOLDER -->
> **Figure 1.** The *Open Tree File* dialog with the VARV tree URL entered in the URL tab (left) and the node-label interpretation dialog set to *bootstraps* (right).
> *Screenshot to be added.*

The tree will load and the canvas will fill with the VARV phylogeny. At this point it is arbitrarily rooted — the root placement is an artefact of the tree-building software and does not necessarily reflect any biological reality.

---

## 2. Ordering the Branches

Before we examine the temporal signal it helps to impose a consistent visual order. Click the **Order ↓** button (or press **⌘D**) to sort all clades so that the clade with the most tips appears at the bottom of the canvas. This produces the classic "pectinate" layout and makes the tree easier to read.

> <!-- FIGURE PLACEHOLDER -->
> **Figure 2.** The VARV tree after applying descending branch order. The largest clade — the 20th-century outbreak strains — is at the bottom.
> *Screenshot to be added.*

---

## 3. Opening and Pinning the RTT Panel

Click the **RTT** button in the toolbar (or press the keyboard shortcut shown in the toolbar tooltip) to open the Root-to-Tip regression panel.

By default the panel floats as an overlay. Click the **Pin** icon (📌) in the panel header to dock it alongside the tree canvas. Drag the divider between the tree and the RTT panel to give the plot a comfortable amount of space — roughly one-third of the total window width is a good starting point.

> <!-- FIGURE PLACEHOLDER -->
> **Figure 3.** PearTree with the RTT panel pinned on the right. The scatter plot shows each tip's collection date on the *x*-axis and its root-to-tip divergence on the *y*-axis.
> *Screenshot to be added.*

In the RTT panel controls, enable the following options:

- **2 s.d. lines** — draws dashed lines at ±2 standard deviations around the regression line, making outliers immediately visible.
- **1:1 aspect ratio** — locks the panel dimensions so the axes are scaled equally, preventing visual distortion of the slope.

Also consider moving the **Info box** (the small statistics summary in the RTT panel) to the right side so it does not obscure the data points in the lower-left of the plot.

> <!-- FIGURE PLACEHOLDER -->
> **Figure 4.** RTT panel with 2 s.d. envelopes and 1:1 aspect ratio enabled. The regression statistics box has been moved to the upper right.
> *Screenshot to be added.*

---

## 4. Interpreting the Initial (Arbitrary) Root

Look at the RTT plot carefully. You will notice two things immediately:

1. **The slope is negative.** Divergence *decreases* as sampling date increases — the most recently sampled genomes appear closest to the root, and the oldest ones are the most divergent.
2. **The oldest branches are the most divergent.** The Viking-age and mediaeval ancient DNA specimens sit far from the regression line, high and to the left.

This is the expected result for an **arbitrarily rooted tree**. When the root is placed in the wrong position it inverts or scrambles the relationship between time and divergence.

> ---
> #### Concept: Why root position matters so much
>
> Root-to-tip divergence is measured as the sum of branch lengths from the root of the tree to each tip. Because every tip's divergence is measured *relative to the root*, placing the root in the wrong position re-distributes those path lengths. A root that is too far into one clade makes tips in that clade appear artificially close to the root while tips in the rest of the tree appear artificially far away. The result is that the regression slope can be negative, near zero, or steeply positive depending solely on where the root sits — regardless of the true evolutionary history.
>
> This is why **the first step in every molecular clock analysis is to find the correct root**, either through outgroup rooting (if a suitable outgroup is available) or through one of the clock-based approaches described below.
> ---

---

## 5. Trying a Manual Re-root

You can experiment with rooting manually to see the effect. Select the internal node that subtends the most divergent ancient-DNA tips and click the **Reroot** button in the toolbar. The tree rerenders with the root placed at the midpoint of the branch above that node.

Alternatively, press **⌘M** (or click the **Midpoint Root** button) for an automatic midpoint root — placing the root at the point that minimises the maximum root-to-tip distance.

> <!-- FIGURE PLACEHOLDER -->
> **Figure 5.** RTT plot after applying a midpoint root. The slope is now positive but the regression is weak and the inferred root date is unrealistically ancient (several thousand years BCE).
> *Screenshot to be added.*

The midpoint root gives a positive slope but the regression is scattered and the root date — extrapolated back from the regression line to divergence = 0 — is implausibly old. Midpoint rooting is a useful heuristic for exploratory work but it takes no account of sampling dates and has no reason to produce a clock-like root.

> ---
> #### Concept: Clock-based rooting
>
> A *molecular clock* assumes that substitutions accumulate at a constant rate through time. Under this model the best root is the one that *maximises the linear correlation* between sampling date and root-to-tip divergence (commonly expressed as the coefficient of determination, *R²*). Two complementary strategies are available in PearTree:
>
> - **Local Temporal Root** — evaluates the root position on a user-selected branch by finding the exact point along that branch that maximises *R²*. This is fast and gives you direct control; you choose *which* branch to root on based on biological knowledge.
> - **Global Temporal Root** — exhaustively searches every branch in the tree and reports the branch (and the exact position along it) that gives the best *R²* overall. This is the automattic equivalent and is useful when you have no prior expectation for the root.
>
> Both methods are equivalent to the *root-to-tip regression* approach implemented in TempEst [[Rambaut *et al.* 2016](https://doi.org/10.1093/ve/vew007)].
> ---

---

## 6. Local Temporal Root

Because we already have some intuition about where the root should lie (somewhere near the base of the tree, separating the major Western from Eastern VARV clades), we can try the **Local Temporal Root** first.

1. Select the branch you want to root on — click one of the main basal branches in **Branches mode** (**⌘B**), placing the branch marker near the base of the tree.
2. Click the **Local Temporal Root** button in the toolbar (or in the RTT panel controls).

PearTree will slide the root along that branch to find the exact position that maximises *R²* and rerender the tree and RTT plot.

> <!-- FIGURE PLACEHOLDER -->
> **Figure 6.** After applying Local Temporal Root on the basal branch. The RTT plot now shows a clear positive slope, a high *R²*, and a root date consistent with known VARV evolutionary history.
> *Screenshot to be added.*

---

## 7. Global Temporal Root

To confirm that this is the globally optimal root — and to demonstrate the automated approach — click **Global Temporal Root** in the RTT panel or toolbar. PearTree evaluates every branch in the tree and moves the root to the branch and position that gives the best *R²*.

> **Tip:** The Global Temporal Root search can take a few seconds on large trees; a progress indicator will appear in the status bar.

For the VARV dataset the global search selects the same branch as the local search, giving you confidence that the result is robust.

> <!-- FIGURE PLACEHOLDER -->
> **Figure 7.** RTT panel after Global Temporal Root. The statistics box shows the slope, intercept, *R²*, and inferred root date.
> *Screenshot to be added.*

Note the key statistics reported in the RTT panel:

| Statistic | Value (approximate) |
|---|---|
| **Slope (evolutionary rate)** | ~5.5 × 10⁻⁶ substitutions/site/year |
| **Root date** | ~7 CE |
| **R²** | high (> 0.9) |

A rate of ~5.5 × 10⁻⁶ subs/site/year is consistent with published estimates for poxviruses [[Firth *et al.* 2010](https://doi.org/10.1371/journal.ppat.1000952); [Duggan *et al.* 2020](https://doi.org/10.1126/science.aba8096)]. A root in approximately the 1st century CE is biologically plausible for the origin of the Old World smallpox clade, though these estimates carry substantial uncertainty.

> ---
> #### Concept: Interpreting the RTT statistics
>
> - **Slope** — the estimated evolutionary rate in substitutions per nucleotide site per year. For RNA viruses this is typically 10⁻³–10⁻⁴; for slowly evolving DNA viruses such as poxviruses it is 10⁻⁵–10⁻⁶.
> - **Root date** — the *x*-intercept of the regression line (where divergence extrapolates to zero). This is an estimate of when the sampled diversity began to diverge from a common ancestor, not necessarily the origin of the virus.
> - **R²** — the fraction of variance in root-to-tip divergence explained by sampling date. An *R²* > 0.85 is generally considered good evidence of clock-like behaviour; values below ~0.5 suggest little or no detectable temporal signal.
> - **Residuals** — the vertical distance of each tip from the regression line. Tips with large positive residuals are more diverged than expected for their sampling date; large negative residuals indicate less divergence than expected.
> ---

---

## 8. Drilling Down into the Modern Outbreak Strains (post-1650)

The full VARV dataset spans almost two millennia and includes ancient DNA sequences that were subject to post-mortem DNA damage and incomplete genome recovery — potential sources of additional noise. To look at the evolutionary signal among the better-characterised more-recent genomes we can narrow the analysis.

Select the internal **MRCA node** that unites the ~1650 CE genome with all of the 20th-century strains. (Look for the deepest node that includes the earliest post-17th-century sequence and all the standard WHO outbreak strains below it.) Then:

- Press **⌘⇧.** (or click the **Drill-down** button in the toolbar), or simply **double-click the node**.

The canvas re-renders showing only the subtree descending from that node. The RTT panel updates automatically to reflect only the tips now in view.

> <!-- FIGURE PLACEHOLDER -->
> **Figure 8.** The VARV tree drilled down to the post-1650 subtree. The RTT panel updates to show only these tips; the rate estimate is similar (~5.5 × 10⁻⁶/year) but the root date is now substantially more recent.
> *Screenshot to be added.*

The evolutionary rate for this subset is still approximately 5.5 × 10⁻⁶ subs/site/year — consistent with the full-tree estimate, suggesting the ancient DNA sequences are not distorting the rate estimate greatly.

---

## 9. Drilling Down Further into 20th-Century Genomes

Now double-click the MRCA node of just the 20th-century (post-1900) genomes to drill down one level further.

> <!-- FIGURE PLACEHOLDER -->
> **Figure 9.** Drilling down to the 20th-century subtree only. The RTT plot shows a faster rate.
> *Screenshot to be added.*

The rate estimate increases to approximately **1.45 × 10⁻⁵ subs/site/year** — roughly 2–3× faster than the longer-term estimate. This is not unusual: shorter sampling windows sometimes yield rate estimates that appear inflated because the dataset captures only recent, rapidly evolving diversity without the rate-smoothing effect of the older lineages.

However, look at the RTT plot carefully. There is a cluster of tips sitting **above** the upper 2 s.d. envelope — more divergent than would be expected for their sampling date.

> ---
> #### Concept: Rate variation and outliers
>
> The RTT regression assumes a **strict molecular clock** — a single, constant rate across all lineages and all time. Real viruses violate this to varying degrees. Common reasons for outlier tips in an RTT plot include:
>
> - **Sequencing errors or contamination** — extra apparent mutations that push a tip upward.
> - **Recombination** — if a genome has exchanged sequence with a divergent lineage it may carry more divergence than expected from its sampling date alone.
> - **Post-mortem DNA damage** — ancient DNA specimens frequently carry deamination artefacts (*C*→*T* substitutions) that mimic genuine evolution.
> - **Sampling bias** — if a subset of sequences represents a locally constrained lineage that has been evolving at a genuinely different rate, it will appear as a coherent cluster of outliers rather than random scatter.
>
> Identifying and, where appropriate, excluding such outliers before a formal molecular clock analysis is standard practice.
> ---

---

## 10. Identifying and Examining Outliers

To make the outlier tips visible on the tree, open the **Visual Options palette** (press **Tab**). Under **Tip Shapes**, change **Colour by** to **Temporal Outliers**.

Tips that fall outside the ±2 s.d. envelope are now marked in a distinct colour (typically red or orange); tips within the envelope are shown in the default colour.

> <!-- FIGURE PLACEHOLDER -->
> **Figure 10.** The 20th-century subtree with tip shapes coloured by *Temporal Outliers*. A cluster of tips above the regression envelope is immediately visible both on the tree and in the RTT scatter plot.
> *Screenshot to be added.*

The outlier tips form a visually coherent cluster in the tree — they are not scattered randomly but are concentrated in a specific clade, suggesting a shared cause.

---

## 11. Selecting Outliers from the RTT Plot

Rather than selecting the tips on the tree, you can select them directly in the RTT scatter plot:

1. In the RTT panel, click and drag to draw a selection rectangle around the cluster of points above the upper 2 s.d. line.

> **Tip:** Holding **Option** (macOS) or **Alt** (Windows/Linux) while dragging may help align the selection box parallel to the regression line, making it easier to capture all the outliers cleanly without accidentally including tips that are near but still within the envelope.

The selected points are immediately highlighted on the tree canvas as well as in the RTT plot.

> <!-- FIGURE PLACEHOLDER -->
> **Figure 11.** RTT plot with a selection box drawn around the outlier cluster above the upper 2 s.d. line (left). The corresponding tips are highlighted on the tree canvas (right).
> *Screenshot to be added.*

Examine the selected tips. Using the **Data Table** panel or **Node Info** (**⌘I**) you will see that these are a coherent group sampled in **East Africa** — including sequences from **1947**, **1972**, and **1977**. Their origins and the cause of their outlier status are not definitively resolved: possibilities include sequencing artefacts in older specimens, recombination, or genuine but localised rate acceleration.

> <!-- FIGURE PLACEHOLDER -->
> **Figure 12.** Node Info dialog for one of the outlier tips, showing its sampling location (East Africa) and year.
> *Screenshot to be added.*

---

## 12. Hiding the Outliers and Re-examining the Signal

With the outlier tips still selected, click the **Hide** button (eye-slash icon) in the toolbar. The selected tips are removed from the view and the tree reflows.

> <!-- FIGURE PLACEHOLDER -->
> **Figure 13.** The 20th-century subtree after hiding the East African outlier cluster. The RTT plot is now clean and tight around the regression line.
> *Screenshot to be added.*

The RTT plot is now notably cleaner. Note the updated statistics:

| Statistic | Before removing outliers | After removing outliers |
|---|---|---|
| **Rate** | ~1.45 × 10⁻⁵ subs/site/year | ~9.8 × 10⁻⁶ subs/site/year |
| **Root date** | — | ~1916 CE |
| **R²** | moderate | high |

The revised rate of ~9.8 × 10⁻⁶ subs/site/year is still faster than the long-term poxvirus rate, consistent with the expectation that short-term rate estimates are often inflated relative to long-term ones — a phenomenon sometimes attributed to the incomplete purging of mildly deleterious mutations over short timescales [[Ho *et al.* 2011](https://doi.org/10.1093/sysbio/syq072)]. The root date of ~1916 CE is plausible as the origin of the 20th-century divergence of the major pox strains.

---

## 13. Saving the Results

### Export the annotated tree (current view)

Click the **Export Tree** button (↓ file icon) or press **⌘S**.

- Set **Format** to **NEXUS**.
- Set **Scope** to **Current subtree view** — this exports only the tips currently visible (i.e. the 20th-century subtree with the outliers hidden).
- Tick **Temporal Outliers** in the Annotations list to save that annotation with the file.
- Tick **Embed settings** to store the current visual layout in the NEXUS file — opening it again in PearTree will restore the colours, axis, and RTT configuration automatically.

> <!-- FIGURE PLACEHOLDER -->
> **Figure 14.** The Export Tree dialog with NEXUS format, *Current subtree view*, and *Embed settings* selected.
> *Screenshot to be added.*

### Export an SVG of the tree

Click the **Export Graphic** button or press **⌘E**.

- Choose **SVG** for a publication-quality vector graphic.
- Choose **Full tree** to export the entire visible subtree, not just the area currently scrolled into view.

> <!-- FIGURE PLACEHOLDER -->
> **Figure 15.** The Export Graphic dialog set to SVG, Full tree.
> *Screenshot to be added.*

### Export an SVG of the RTT plot

In the RTT panel header, click the **Export** button (or right-click the plot area and choose *Save as SVG*). This saves a vector version of the scatter plot, including the regression line and ±2 s.d. envelopes, suitable for inclusion in a manuscript.

### Export RTT data as CSV

In the RTT panel, click the **Export CSV** button. This downloads a table with one row per visible tip containing:

| Column | Description |
|---|---|
| `name` | Tip label |
| `date` | Parsed sampling date (decimal year) |
| `divergence` | Root-to-tip divergence |
| `residual` | Distance from the regression line |
| `outlier` | Whether the tip falls outside the ±2 s.d. envelope |

This table can be imported into R, Python, or any statistics package for further analysis.

---

## Next Steps: Running a Formal Molecular Clock Analysis with BEAST X

The RTT regression is a **preliminary screening tool**. It tells you whether a temporal signal exists and gives rough estimates of rate and root age, but it does not provide confidence intervals, does not model rate variation among lineages, and does not integrate over phylogenetic uncertainty.

A widely used package for Bayesian molecular clock analysis is **BEAST X** (Bayesian Evolutionary Analysis by Sampling Trees).

> ---
> #### From PearTree RTT results to a BEAST X analysis
>
<!-- > 1. **Use the RTT rate as a prior.** The slope from the RTT regression (~9.8 × 10⁻⁶ subs/site/year for the 20th-century VARV data) can be used to set an informed prior on the clock rate in BEAST X, for example a log-normal prior centred on that value. -->
> 2. **Use the RTT root date as a sanity check.** The Bayesian analysis will estimate its own root age from the data; the RTT estimate provides a -rough independent cross-check-.
> 3. **Exclude the identified outliers.** The East African sequence cluster that fell outside the ±2 s.d. envelope should be either excluded from the BEAST X alignment or placed in a separate partition with a relaxed clock if there is a biological reason to retain them.
> 4. **Choose a clock model.** For the 20th-century VARV data a **strict clock** (single rate across all branches) is a reasonable starting point, given the tight RTT correlation we observed after outlier removal. If the residuals from the RTT regression are large you may prefer a **relaxed clock** (uncorrelated log-normal or exponential).
> 5. **Choose a tree prior.** A **coalescent** prior (e.g. Bayesian Skyline) is appropriate for within-host or within-species datasets; a **birth–death** tree prior is more appropriate when sampling through time spans multiple host generations.
> ---

**Resources:**

- BEAST X documentation and tutorials: [https://beast.community](https://beast.community)  
- BEAST X downloads: [https://gihub.com/beastdev/beastmcmc](https://gihub.com/beastdev/beastmcmc)
---

## Summary

In this tutorial you have:

1. Loaded a multi-century VARV phylogeny and observed the effect of arbitrary rooting on the RTT plot.
2. Used **Local** and **Global Temporal Root** to find the clock-optimal root position.
3. Interpreted the key RTT statistics: evolutionary rate (~5.5 × 10⁻⁶ subs/site/year), root date (~7 CE), and *R²*.
4. Used the **Drill-down** tool to focus on increasingly recent subsets of the data.
5. Identified a coherent cluster of outlier tips (East African sequences, 1947–1977) using the **Temporal Outliers** colour annotation and RTT selection.
6. Hidden those outliers and observed the improved temporal signal (~9.8 × 10⁻⁶ subs/site/year, root ~1916 CE) in the 20th-century genomes.
7. Exported the annotated subtree (NEXUS with embedded settings), an SVG figure of the tree and RTT plot, and the RTT data as a CSV file.

---

## References

- **Rambaut A, Lam TT, Max Carvalho L, Pybus OG** (2016). Exploring the temporal structure of heterochronous sequences using TempEst. *Virus Evolution* **2**(1): vew007. [https://doi.org/10.1093/ve/vew007](https://doi.org/10.1093/ve/vew007)

- **Firth C, Kitchen A, Shapiro B, Suchard MA, Holmes EC, Rambaut A** (2010). Using time-structured data to estimate evolutionary rates of double-stranded DNA viruses. *PLOS Pathogens* **6**(9): e1000952. [https://doi.org/10.1371/journal.ppat.1000952](https://doi.org/10.1371/journal.ppat.1000952)

- **Duggan AT, Klunk J, Porter AF, Dhody AN, Hicks R, Smith GL, McCollum AM, Wilkins K, Worobey M, Holmes EC, Poinar HN, Damon I** (2020). The origins and genomic diversity of American Civil War Era smallpox vaccine strains. *Science* **369**(6499): 103–108. [https://doi.org/10.1126/science.aba8096](https://doi.org/10.1126/science.aba8096)

- **Ho SYW, Lanfear R, Bromham L, Phillips MJ, Soubrier J, Rodrigo AG, Cooper A** (2011). Time-dependent rates of molecular evolution. *Molecular Ecology* **20**(15): 3087–3101. [https://doi.org/10.1111/j.1365-294X.2011.05178.x](https://doi.org/10.1111/j.1365-294X.2011.05178.x) *(on the time-dependency of rate estimates)*

- **Suchard MA, Lemey P, Baele G, Ayres DL, Drummond AJ, Rambaut A** (2018). Bayesian phylogenetic and phylodynamic data integration using BEAST 1.10. *Virus Evolution* **4**(1): vey016. [https://doi.org/10.1093/ve/vey016](https://doi.org/10.1093/ve/vey016)
